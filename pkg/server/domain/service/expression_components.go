/*
Copyright 2026 The KubeVela Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package service

import (
	"context"
	"fmt"
	"regexp"
	"sort"

	"github.com/kubevela/pkg/multicluster"
	"github.com/oam-dev/kubevela/apis/core.oam.dev/v1beta1"
	"github.com/oam-dev/kubevela/pkg/appkeeper"
	"github.com/oam-dev/kubevela/pkg/definition/celexpr"
	"github.com/oam-dev/kubevela/pkg/definition/propexpr"
	"github.com/oam-dev/kubevela/pkg/oam"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/klog/v2"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"github.com/kubevela/velaux/pkg/server/domain/model"
	"github.com/kubevela/velaux/pkg/server/infrastructure/datastore"
	apisv1 "github.com/kubevela/velaux/pkg/server/interfaces/api/dto/v1"
)

// readsComponents reports whether expressions on a surface may read
// component.<name>: only a component's render can wait for its producer.
func readsComponents(surface string) bool {
	return surface == "component" || surface == "trait"
}

// liveOutput is a component's applied objects as a read sees them: output is
// its workload, outputs its trait resources by trait.oam.dev/resource.
type liveOutput struct {
	output  map[string]interface{}
	outputs map[string]map[string]interface{}
}

// componentRoot is the component variable on a surface that reads components:
// every component but the one being edited, each with the fields of its
// deployed output where it has one.
func (e *expressionServiceImpl) componentRoot(ctx context.Context, app *model.Application, surface, editing string) *apisv1.ExpressionVariable {
	if !readsComponents(surface) {
		return nil
	}
	root := &apisv1.ExpressionVariable{Name: propexpr.ComponentIdent, Type: "object",
		Description: "The application's other components, read once healthy; the reader waits for them"}
	names, crs := e.componentNames(ctx, app)
	live := e.liveOutputs(ctx, crs)
	for _, name := range names {
		if name == editing {
			continue
		}
		comp := &apisv1.ExpressionVariable{Name: name, Type: "object",
			Description: fmt.Sprintf("Component %s, beside the reader unless cluster() or namespace() names a placement", name)}
		out := live[name]
		output := &apisv1.ExpressionVariable{Name: "output", Type: "object", Description: "The component's workload, as deployed"}
		if out.output != nil {
			output = liveVariable("output", out.output, 0)
			output.Description = "The component's workload, as deployed"
		}
		outputs := &apisv1.ExpressionVariable{Name: "outputs", Type: "object", Description: "The component's trait resources, by name"}
		keys := make([]string, 0, len(out.outputs))
		for k := range out.outputs {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			outputs.Children = append(outputs.Children, withStatus(liveVariable(k, out.outputs[k], 0)))
		}
		comp.Children = []*apisv1.ExpressionVariable{withStatus(output), outputs}
		root.Children = append(root.Children, comp)
	}
	return root
}

// withStatus gives an object a status of any type in place of whatever it
// reported: its controller writes the status, so a reader casts what it takes,
// and an object that has not reported one yet still offers it.
func withStatus(obj *apisv1.ExpressionVariable) *apisv1.ExpressionVariable {
	children := obj.Children[:0]
	for _, c := range obj.Children {
		if c.Name != "status" {
			children = append(children, c)
		}
	}
	obj.Children = append(children, &apisv1.ExpressionVariable{Name: "status", Type: "dyn",
		Description: "Written by the object's controller, so any type: cast what you read, such as int(...) or string(...)"})
	return obj
}

// componentNames is the components the application declares, from the
// datastore and from its deployed Applications, sorted; crs are those
// Applications.
func (e *expressionServiceImpl) componentNames(ctx context.Context, app *model.Application) ([]string, []*v1beta1.Application) {
	seen := map[string]bool{}
	if e.Store != nil {
		comps, err := e.Store.List(ctx, &model.ApplicationComponent{AppPrimaryKey: app.PrimaryKey()}, &datastore.ListOptions{})
		if err == nil {
			for _, c := range comps {
				seen[c.(*model.ApplicationComponent).Name] = true
			}
		}
	}
	crs := e.deployedApplications(ctx, app)
	for _, cr := range crs {
		for _, c := range cr.Spec.Components {
			seen[c.Name] = true
		}
	}
	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, crs
}

// deployedApplications is the Application each of the application's envs deploys.
func (e *expressionServiceImpl) deployedApplications(ctx context.Context, app *model.Application) []*v1beta1.Application {
	if e.KubeClient == nil || e.EnvBindingService == nil {
		return nil
	}
	bindings, err := e.EnvBindingService.GetEnvBindings(ctx, app)
	if err != nil {
		return nil
	}
	var out []*v1beta1.Application
	for _, env := range bindings {
		cr := &v1beta1.Application{}
		if err := e.KubeClient.Get(ctx, client.ObjectKey{Namespace: env.AppDeployNamespace, Name: env.AppDeployName}, cr); err == nil {
			out = append(out, cr)
		}
	}
	return out
}

// liveOutputs reads each component's applied objects, as its ResourceTracker
// records them, from the first deployed Application that applied it. The
// controller reads the same objects at the reader's placement; any placement
// shows their shape.
func (e *expressionServiceImpl) liveOutputs(ctx context.Context, crs []*v1beta1.Application) map[string]liveOutput {
	out := map[string]liveOutput{}
	for _, cr := range crs {
		root, current, _, _, err := appkeeper.ListApplicationResourceTrackers(ctx, e.KubeClient, cr)
		if err != nil {
			klog.V(4).Infof("no resource trackers for %s/%s: %v", cr.Namespace, cr.Name, err)
			continue
		}
		done := map[string]bool{}
		for name := range out {
			done[name] = true
		}
		for _, rt := range []*v1beta1.ResourceTracker{current, root} {
			if rt == nil {
				continue
			}
			for _, mr := range rt.Spec.ManagedResources {
				if mr.Deleted || mr.Component == "" || done[mr.Component] {
					continue
				}
				obj := &unstructured.Unstructured{}
				obj.SetAPIVersion(mr.APIVersion)
				obj.SetKind(mr.Kind)
				if err := e.KubeClient.Get(multicluster.WithCluster(ctx, mr.Cluster), client.ObjectKey{Namespace: mr.Namespace, Name: mr.Name}, obj); err != nil {
					continue
				}
				lo := out[mr.Component]
				if res := obj.GetLabels()[oam.TraitResource]; res != "" {
					if lo.outputs == nil {
						lo.outputs = map[string]map[string]interface{}{}
					}
					lo.outputs[res] = trimmed(obj.Object)
				} else if lo.output == nil && mr.Trait == "" {
					lo.output = trimmed(obj.Object)
				}
				out[mr.Component] = lo
			}
		}
	}
	return out
}

// trimmed drops what the API server keeps about an object rather than what it
// is: managed fields and the last-applied copies.
func trimmed(obj map[string]interface{}) map[string]interface{} {
	u := (&unstructured.Unstructured{Object: obj}).DeepCopy()
	u.SetManagedFields(nil)
	annotations := u.GetAnnotations()
	for _, k := range []string{oam.AnnotationLastAppliedConfig, oam.AnnotationLastAppliedConfiguration} {
		delete(annotations, k)
	}
	if len(annotations) == 0 {
		annotations = nil
	}
	u.SetAnnotations(annotations)
	return u.Object
}

// liveVariable is a field of a live object by its JSON type. It carries no
// schema or description: a live value is data, and the editor shows types only.
func liveVariable(name string, v interface{}, depth int) *apisv1.ExpressionVariable {
	out := &apisv1.ExpressionVariable{Name: name, Type: liveKind(v)}
	m, ok := v.(map[string]interface{})
	if !ok || depth >= maxVariableDepth {
		return out
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		out.Children = append(out.Children, liveVariable(k, m[k], depth+1))
	}
	return out
}

func liveKind(v interface{}) string {
	switch t := v.(type) {
	case string:
		return "string"
	case bool:
		return "bool"
	case int64, int32, int:
		return "int"
	case float64, float32:
		return "number"
	case []interface{}:
		if len(t) > 0 {
			return "list(" + liveKind(t[0]) + ")"
		}
		return "list"
	case map[string]interface{}:
		return "object"
	}
	return "dyn"
}

// hyphenatedComponentRead is a component read with a dot whose name has a
// hyphen, which CEL parses as subtraction: component.my-db is component.my - db.
var hyphenatedComponentRead = regexp.MustCompile(`\bcomponent\.([A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)+)`)

// componentIssues reports the component reads in an expression the controller
// would refuse: a hyphenated name read with a dot, a read on a surface that
// cannot read components, of the component itself, or of a component the
// application does not have.
func (e *expressionServiceImpl) componentIssues(ctx context.Context, app *model.Application, req apisv1.ExpressionCheckRequest, expr string, start int) []*apisv1.ExpressionIssue {
	if m := hyphenatedComponentRead.FindStringSubmatchIndex(expr); m != nil {
		name := expr[m[2]:m[3]]
		return []*apisv1.ExpressionIssue{{
			Message: fmt.Sprintf("write component[%q]: a component whose name has a hyphen is read by index", name),
			Start:   start + m[0], End: start + m[1],
			Fix: fmt.Sprintf("component[%q]", name),
		}}
	}
	refs, err := celexpr.PropertyReferences(expr)
	if err != nil {
		return nil
	}
	var names map[string]bool
	var out []*apisv1.ExpressionIssue
	issue := func(msg string) {
		out = append(out, &apisv1.ExpressionIssue{Message: msg, Start: start, End: start + len(expr)})
	}
	for _, r := range refs {
		if !r.IsComponent() || len(r.Path) == 0 {
			continue
		}
		name := r.Path[0]
		switch {
		case !readsComponents(req.Surface):
			issue("only component and trait properties can read component.<name>")
			return out
		case name == req.Component:
			issue("a component cannot read its own output")
		default:
			if names == nil {
				names = map[string]bool{}
				list, _ := e.componentNames(ctx, app)
				for _, n := range list {
					names[n] = true
				}
			}
			if !names[name] {
				issue(fmt.Sprintf("no component named %s", name))
			}
		}
	}
	return out
}
