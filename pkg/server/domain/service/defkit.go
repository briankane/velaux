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
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"

	oamv1alpha1 "github.com/kubevela/pkg/apis/oam/v1alpha1"
	workflowv1alpha1 "github.com/kubevela/workflow/api/v1alpha1"
	"github.com/oam-dev/kubevela/apis/core.oam.dev/common"
	"github.com/oam-dev/kubevela/apis/core.oam.dev/v1beta1"
	"github.com/oam-dev/kubevela/apis/types"
	"github.com/oam-dev/kubevela/pkg/appkeeper"
	"github.com/oam-dev/kubevela/pkg/oam"
	"github.com/oam-dev/kubevela/pkg/workflow/operation"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/yaml"

	apisv1 "github.com/kubevela/velaux/pkg/server/interfaces/api/dto/v1"
	"github.com/kubevela/velaux/pkg/server/utils/bcode"
)

// A DefKit module is an Application of the defkit addon in vela-system: its
// workflow renders the module in a Job, waits for review, then applies the
// definitions, which its ResourceTracker then owns.
const (
	defkitModuleLabel     = "defkit.oam.dev/module"
	defkitAppPrefix       = "defkit-"
	defkitRenderNamespace = "vela-defkit"
	defkitRenderStep      = "render"
	defkitReviewStep      = "review"
	defkitApplyStep       = "apply"
	defkitRenderStepType  = "defkit-render"
	defkitApplyStepType   = "defkit-apply"

	defkitKeyModule      = "module.json"
	defkitKeyDefinitions = "definitions.json"
	defkitKeyErrors      = "errors.json"
	defkitKeySkip        = "skip.json"
	defkitRenderedAt     = "defkit.oam.dev/rendered-at"
)

// Module phases, from its Application's workflow.
const (
	defkitPhaseRendering = "rendering"
	defkitPhaseReview    = "review"
	defkitPhaseApplying  = "applying"
	defkitPhaseApplied   = "applied"
	defkitPhaseFailed    = "failed"
)

// Preview statuses.
const (
	defkitNew       = "new"
	defkitChanged   = "changed"
	defkitUnchanged = "unchanged"
	defkitConflict  = "conflict"
	defkitRemoved   = "removed"
)

// definitionKinds are what a module installs.
var definitionKinds = map[string]bool{
	v1beta1.ComponentDefinitionKind:    true,
	v1beta1.TraitDefinitionKind:        true,
	v1beta1.PolicyDefinitionKind:       true,
	v1beta1.WorkflowStepDefinitionKind: true,
}

// DefKitService installs DefKit definition modules as Applications.
type DefKitService interface {
	ListModules(ctx context.Context) (*apisv1.ListDefKitModulesResponse, error)
	DetailModule(ctx context.Context, name string) (*apisv1.DefKitModuleDetail, error)
	CreateModule(ctx context.Context, req apisv1.CreateDefKitModuleRequest) (*apisv1.DefKitModule, error)
	UpdateModule(ctx context.Context, name string, src apisv1.DefKitSource) (*apisv1.DefKitModule, error)
	PreviewModule(ctx context.Context, name string) (*apisv1.DefKitPreview, error)
	ApplyPreview(ctx context.Context, name string, req apisv1.ApplyDefKitPreviewRequest) error
	DeleteModule(ctx context.Context, name string) error
}

type defkitServiceImpl struct {
	KubeClient client.Client `inject:"kubeClient"`
}

// NewDefKitService is the service behind Extensions → DefKit Modules.
func NewDefKitService() DefKitService {
	return &defkitServiceImpl{}
}

func (s *defkitServiceImpl) addonEnabled(ctx context.Context) bool {
	for _, name := range []string{defkitRenderStepType, defkitApplyStepType} {
		if err := s.KubeClient.Get(ctx, client.ObjectKey{Namespace: types.DefaultKubeVelaNS, Name: name}, &v1beta1.WorkflowStepDefinition{}); err != nil {
			return false
		}
	}
	return true
}

func (s *defkitServiceImpl) ListModules(ctx context.Context) (*apisv1.ListDefKitModulesResponse, error) {
	apps := &v1beta1.ApplicationList{}
	if err := s.KubeClient.List(ctx, apps, client.InNamespace(types.DefaultKubeVelaNS), client.HasLabels{defkitModuleLabel}); err != nil {
		return nil, err
	}
	resp := &apisv1.ListDefKitModulesResponse{AddonEnabled: s.addonEnabled(ctx), Modules: []*apisv1.DefKitModule{}}
	for i := range apps.Items {
		m, _ := s.module(ctx, &apps.Items[i])
		resp.Modules = append(resp.Modules, m)
	}
	sort.Slice(resp.Modules, func(i, j int) bool { return resp.Modules[i].Name < resp.Modules[j].Name })
	return resp, nil
}

func (s *defkitServiceImpl) DetailModule(ctx context.Context, name string) (*apisv1.DefKitModuleDetail, error) {
	app, err := s.application(ctx, name)
	if err != nil {
		return nil, err
	}
	m, installed := s.module(ctx, app)
	detail := &apisv1.DefKitModuleDetail{DefKitModule: *m, Definitions: []*apisv1.DefKitDefinition{}}
	for _, ref := range installed {
		def := &apisv1.DefKitDefinition{Kind: ref.Kind, Name: ref.Name}
		obj := &unstructured.Unstructured{}
		obj.SetAPIVersion(ref.APIVersion)
		obj.SetKind(ref.Kind)
		if err := s.KubeClient.Get(ctx, client.ObjectKey{Namespace: ref.Namespace, Name: ref.Name}, obj); err == nil {
			def.Description = obj.GetAnnotations()[types.AnnoDefinitionDescription]
		}
		detail.Definitions = append(detail.Definitions, def)
	}
	return detail, nil
}

func (s *defkitServiceImpl) CreateModule(ctx context.Context, req apisv1.CreateDefKitModuleRequest) (*apisv1.DefKitModule, error) {
	if !s.addonEnabled(ctx) {
		return nil, bcode.ErrDefKitAddonDisabled
	}
	if (req.Ref == "") == (req.Git == "") {
		return nil, bcode.ErrDefKitNoSource
	}
	app := defkitApplication(req.Name, req.DefKitSource)
	if err := s.KubeClient.Create(ctx, app); err != nil {
		if apierrors.IsAlreadyExists(err) {
			return nil, bcode.ErrDefKitModuleExist
		}
		return nil, err
	}
	m, _ := s.module(ctx, app)
	return m, nil
}

func (s *defkitServiceImpl) UpdateModule(ctx context.Context, name string, src apisv1.DefKitSource) (*apisv1.DefKitModule, error) {
	if (src.Ref == "") == (src.Git == "") {
		return nil, bcode.ErrDefKitNoSource
	}
	app, err := s.application(ctx, name)
	if err != nil {
		return nil, err
	}
	app.Spec = defkitApplication(name, src).Spec
	if err := s.KubeClient.Update(ctx, app); err != nil {
		return nil, err
	}
	m, _ := s.module(ctx, app)
	return m, nil
}

func (s *defkitServiceImpl) DeleteModule(ctx context.Context, name string) error {
	app, err := s.application(ctx, name)
	if err != nil {
		return err
	}
	return s.KubeClient.Delete(ctx, app)
}

func (s *defkitServiceImpl) PreviewModule(ctx context.Context, name string) (*apisv1.DefKitPreview, error) {
	app, err := s.application(ctx, name)
	if err != nil {
		return nil, err
	}
	preview, _, err := s.preview(ctx, app)
	return preview, err
}

func (s *defkitServiceImpl) ApplyPreview(ctx context.Context, name string, req apisv1.ApplyDefKitPreviewRequest) error {
	app, err := s.application(ctx, name)
	if err != nil {
		return err
	}
	preview, cm, err := s.preview(ctx, app)
	if err != nil {
		return err
	}
	if preview.Phase != defkitPhaseReview || cm == nil {
		return bcode.ErrDefKitNotInReview
	}
	takeOver, remove := setOf(req.TakeOver), setOf(req.Delete)
	skip := []string{}
	var deletes []*apisv1.DefKitPreviewItem
	for _, item := range preview.Items {
		id := item.Kind + "/" + item.Name
		switch {
		case item.Status == defkitConflict && !takeOver[id]:
			skip = append(skip, id)
		case item.Status == defkitRemoved && remove[id]:
			deletes = append(deletes, item)
		}
	}
	b, err := json.Marshal(skip)
	if err != nil {
		return err
	}
	cm.Data[defkitKeySkip] = string(b)
	if err := s.KubeClient.Update(ctx, cm); err != nil {
		return err
	}
	for _, item := range deletes {
		obj := &unstructured.Unstructured{}
		obj.SetAPIVersion(v1beta1.SchemeGroupVersion.String())
		obj.SetKind(item.Kind)
		obj.SetNamespace(types.DefaultKubeVelaNS)
		obj.SetName(item.Name)
		if err := s.KubeClient.Delete(ctx, obj); err != nil && !apierrors.IsNotFound(err) {
			return err
		}
	}
	return operation.ResumeWorkflow(ctx, s.KubeClient, app, "")
}

func (s *defkitServiceImpl) application(ctx context.Context, name string) (*v1beta1.Application, error) {
	app := &v1beta1.Application{}
	if err := s.KubeClient.Get(ctx, client.ObjectKey{Namespace: types.DefaultKubeVelaNS, Name: defkitAppPrefix + name}, app); err != nil {
		if apierrors.IsNotFound(err) {
			return nil, bcode.ErrDefKitModuleNotExist
		}
		return nil, err
	}
	if app.Labels[defkitModuleLabel] == "" {
		return nil, bcode.ErrDefKitModuleNotExist
	}
	return app, nil
}

// module is an Application as a module, with the definitions it has installed.
func (s *defkitServiceImpl) module(ctx context.Context, app *v1beta1.Application) (*apisv1.DefKitModule, []common.ClusterObjectReference) {
	phase, message := defkitPhase(app)
	m := &apisv1.DefKitModule{
		Name: app.Labels[defkitModuleLabel], Source: defkitSourceOf(app),
		Phase: phase, Message: message, Counts: map[string]int{},
		UpdateTime: app.CreationTimestamp.Time,
	}
	if app.Status.Workflow != nil && !app.Status.Workflow.StartTime.IsZero() {
		m.UpdateTime = app.Status.Workflow.StartTime.Time
	}
	if cm := s.renderFor(ctx, app); cm != nil {
		m.Info = renderInfo(cm)
	}
	installed := s.installed(ctx, app)
	for _, ref := range installed {
		m.Counts[ref.Kind]++
	}
	return m, installed
}

// installed is what the module's ResourceTracker holds of definition kinds.
func (s *defkitServiceImpl) installed(ctx context.Context, app *v1beta1.Application) []common.ClusterObjectReference {
	root, current, history, _, err := appkeeper.ListApplicationResourceTrackers(ctx, s.KubeClient, app)
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	var out []common.ClusterObjectReference
	for _, rt := range append([]*v1beta1.ResourceTracker{current, root}, history...) {
		if rt == nil {
			continue
		}
		for _, mr := range rt.Spec.ManagedResources {
			id := mr.Kind + "/" + mr.Name
			if mr.Deleted || !definitionKinds[mr.Kind] || seen[id] {
				continue
			}
			seen[id] = true
			out = append(out, mr.ClusterObjectReference)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return out[i].Kind < out[j].Kind
		}
		return out[i].Name < out[j].Name
	})
	return out
}

// renderFor is the newest render ConfigMap of the Application's current
// source: a ConfigMap records the source it was rendered from.
func (s *defkitServiceImpl) renderFor(ctx context.Context, app *v1beta1.Application) *corev1.ConfigMap {
	cms := &corev1.ConfigMapList{}
	if err := s.KubeClient.List(ctx, cms, client.InNamespace(defkitRenderNamespace), client.MatchingLabels{defkitModuleLabel: app.Name}); err != nil {
		return nil
	}
	want := defkitSourceOf(app)
	var best *corev1.ConfigMap
	for i := range cms.Items {
		cm := &cms.Items[i]
		var rendered struct {
			Source apisv1.DefKitSource `json:"source"`
		}
		if json.Unmarshal([]byte(cm.Data[defkitKeyModule]), &rendered) != nil || !sameSource(rendered.Source, want) {
			continue
		}
		if best == nil || cm.Annotations[defkitRenderedAt] > best.Annotations[defkitRenderedAt] {
			best = cm
		}
	}
	return best
}

// preview diffs the pending render against the cluster.
func (s *defkitServiceImpl) preview(ctx context.Context, app *v1beta1.Application) (*apisv1.DefKitPreview, *corev1.ConfigMap, error) {
	phase, message := defkitPhase(app)
	preview := &apisv1.DefKitPreview{Phase: phase, Message: message, Items: []*apisv1.DefKitPreviewItem{}}
	cm := s.renderFor(ctx, app)
	if cm == nil {
		return preview, nil, nil
	}
	preview.Info = renderInfo(cm)
	_ = json.Unmarshal([]byte(cm.Data[defkitKeyErrors]), &preview.Errors)
	var rendered []map[string]interface{}
	if err := json.Unmarshal([]byte(cm.Data[defkitKeyDefinitions]), &rendered); err != nil {
		return nil, nil, fmt.Errorf("read render %s: %w", cm.Name, err)
	}
	inRender := map[string]bool{}
	for _, obj := range rendered {
		next := &unstructured.Unstructured{Object: obj}
		item := &apisv1.DefKitPreviewItem{DefKitDefinition: apisv1.DefKitDefinition{
			Kind: next.GetKind(), Name: next.GetName(),
			Description: next.GetAnnotations()[types.AnnoDefinitionDescription],
		}}
		inRender[item.Kind+"/"+item.Name] = true
		item.Next = definitionYAML(next)
		current := &unstructured.Unstructured{}
		current.SetAPIVersion(next.GetAPIVersion())
		current.SetKind(next.GetKind())
		err := s.KubeClient.Get(ctx, client.ObjectKey{Namespace: types.DefaultKubeVelaNS, Name: next.GetName()}, current)
		switch {
		case apierrors.IsNotFound(err):
			item.Status = defkitNew
		case err != nil:
			return nil, nil, err
		default:
			item.Current = definitionYAML(current)
			switch {
			case current.GetLabels()[oam.LabelAppName] != app.Name:
				item.Status = defkitConflict
			case sameDefinition(current, next):
				item.Status = defkitUnchanged
				item.Current, item.Next = "", ""
			default:
				item.Status = defkitChanged
			}
		}
		preview.Items = append(preview.Items, item)
	}
	for _, ref := range s.installed(ctx, app) {
		if !inRender[ref.Kind+"/"+ref.Name] {
			preview.Items = append(preview.Items, &apisv1.DefKitPreviewItem{
				DefKitDefinition: apisv1.DefKitDefinition{Kind: ref.Kind, Name: ref.Name},
				Status:           defkitRemoved,
			})
		}
	}
	return preview, cm, nil
}

// defkitApplication is the Application that installs a module.
func defkitApplication(name string, src apisv1.DefKitSource) *v1beta1.Application {
	render, _ := json.Marshal(map[string]interface{}{
		"ref": src.Ref, "git": src.Git, "version": src.Version, "prefix": src.Prefix, "types": nonNil(src.Types),
	})
	gc, _ := json.Marshal(map[string]interface{}{"keepLegacyResource": true})
	takeOver, _ := json.Marshal(map[string]interface{}{"rules": []interface{}{map[string]interface{}{
		"selector": map[string]interface{}{"resourceTypes": sortedKinds()},
	}}})
	return &v1beta1.Application{
		TypeMeta: metav1.TypeMeta{APIVersion: v1beta1.SchemeGroupVersion.String(), Kind: v1beta1.ApplicationKind},
		ObjectMeta: metav1.ObjectMeta{
			Name: defkitAppPrefix + name, Namespace: types.DefaultKubeVelaNS,
			// from-inner keeps it out of VelaUX's synced applications.
			Labels: map[string]string{defkitModuleLabel: name, types.LabelSourceOfTruth: types.FromInner},
		},
		Spec: v1beta1.ApplicationSpec{
			Components: []common.ApplicationComponent{},
			Policies: []v1beta1.AppPolicy{
				// An update keeps what it no longer renders; a review deletes the ones it picks.
				{Name: "keep-removed-definitions", Type: "garbage-collect", Properties: &runtime.RawExtension{Raw: gc}},
				// Safe because a review skips every conflict it does not pick.
				{Name: "take-over-reviewed", Type: "take-over", Properties: &runtime.RawExtension{Raw: takeOver}},
			},
			Workflow: &v1beta1.Workflow{Steps: []oamv1alpha1.WorkflowStep{
				{WorkflowStepBase: oamv1alpha1.WorkflowStepBase{
					Name: defkitRenderStep, Type: defkitRenderStepType, Properties: &runtime.RawExtension{Raw: render},
					Outputs: oamv1alpha1.StepOutputs{{Name: "rendered", ValueFrom: "configMap"}},
				}},
				{WorkflowStepBase: oamv1alpha1.WorkflowStepBase{Name: defkitReviewStep, Type: "suspend"}},
				{WorkflowStepBase: oamv1alpha1.WorkflowStepBase{
					Name: defkitApplyStep, Type: defkitApplyStepType,
					Inputs: oamv1alpha1.StepInputs{{From: "rendered", ParameterKey: "configMap"}},
				}},
			}},
		},
	}
}

// defkitSourceOf reads the source back from the render step's properties.
func defkitSourceOf(app *v1beta1.Application) apisv1.DefKitSource {
	var src apisv1.DefKitSource
	if app.Spec.Workflow == nil {
		return src
	}
	for _, step := range app.Spec.Workflow.Steps {
		if step.Name == defkitRenderStep && step.Properties != nil {
			_ = json.Unmarshal(step.Properties.Raw, &src)
		}
	}
	return src
}

// defkitPhase reads where a module's workflow is. A spec the controller has
// not reconciled yet is a render about to start.
func defkitPhase(app *v1beta1.Application) (string, string) {
	wf := app.Status.Workflow
	if wf == nil || app.Status.ObservedGeneration < app.Generation {
		return defkitPhaseRendering, ""
	}
	steps := map[string]workflowv1alpha1.StepStatus{}
	for _, st := range wf.Steps {
		steps[st.Name] = st.StepStatus
	}
	for _, name := range []string{defkitRenderStep, defkitApplyStep} {
		if st := steps[name]; st.Phase == workflowv1alpha1.WorkflowStepPhaseFailed {
			return defkitPhaseFailed, st.Message
		}
	}
	switch {
	case steps[defkitApplyStep].Phase == workflowv1alpha1.WorkflowStepPhaseSucceeded:
		return defkitPhaseApplied, ""
	case steps[defkitApplyStep].Phase != "":
		return defkitPhaseApplying, ""
	case steps[defkitReviewStep].Phase == workflowv1alpha1.WorkflowStepPhaseSuspending:
		return defkitPhaseReview, ""
	case steps[defkitReviewStep].Phase == workflowv1alpha1.WorkflowStepPhaseSucceeded:
		return defkitPhaseApplying, ""
	}
	return defkitPhaseRendering, steps[defkitRenderStep].Message
}

func renderInfo(cm *corev1.ConfigMap) *apisv1.DefKitModuleInfo {
	var raw struct {
		apisv1.DefKitModuleInfo
		Version string `json:"version"`
	}
	if json.Unmarshal([]byte(cm.Data[defkitKeyModule]), &raw) != nil {
		return nil
	}
	info := raw.DefKitModuleInfo
	info.ResolvedVersion = raw.Version
	return &info
}

func sameSource(a, b apisv1.DefKitSource) bool {
	return a.Ref == b.Ref && a.Git == b.Git && a.Version == b.Version && a.Prefix == b.Prefix &&
		strings.Join(a.Types, ",") == strings.Join(b.Types, ",")
}

// sameDefinition compares what a definition's author writes: its spec, labels
// and annotations, leaving out what KubeVela stamps on applied objects.
func sameDefinition(current, next *unstructured.Unstructured) bool {
	return reflect.DeepEqual(authored(current), authored(next))
}

// authored is the part of a definition its author writes. The spec goes
// through its typed form, so a field left out and one at its zero value match.
func authored(u *unstructured.Unstructured) map[string]interface{} {
	out := map[string]interface{}{"spec": typedSpec(u)}
	if l := authoredMeta(u.GetLabels()); len(l) > 0 {
		out["labels"] = l
	}
	if a := authoredMeta(u.GetAnnotations()); len(a) > 0 {
		out["annotations"] = a
	}
	return out
}

// typedSpec is a definition's spec as its Go type writes it back.
func typedSpec(u *unstructured.Unstructured) interface{} {
	var typed runtime.Object
	switch u.GetKind() {
	case v1beta1.ComponentDefinitionKind:
		typed = &v1beta1.ComponentDefinition{}
	case v1beta1.TraitDefinitionKind:
		typed = &v1beta1.TraitDefinition{}
	case v1beta1.PolicyDefinitionKind:
		typed = &v1beta1.PolicyDefinition{}
	case v1beta1.WorkflowStepDefinitionKind:
		typed = &v1beta1.WorkflowStepDefinition{}
	default:
		return u.Object["spec"]
	}
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, typed); err != nil {
		return u.Object["spec"]
	}
	back, err := runtime.DefaultUnstructuredConverter.ToUnstructured(typed)
	if err != nil {
		return u.Object["spec"]
	}
	return back["spec"]
}

// stampedPrefixes are the label and annotation keys KubeVela and kubectl write.
var stampedPrefixes = []string{"app.oam.dev/", "owner.oam.dev/", "oam.dev/", "kubectl.kubernetes.io/"}

func authoredMeta(m map[string]string) map[string]interface{} {
	out := map[string]interface{}{}
	for k, v := range m {
		stamped := false
		for _, p := range stampedPrefixes {
			stamped = stamped || strings.HasPrefix(k, p)
		}
		if !stamped {
			out[k] = v
		}
	}
	return out
}

// definitionYAML is a definition as its author would read it.
func definitionYAML(u *unstructured.Unstructured) string {
	meta := map[string]interface{}{"name": u.GetName()}
	a := authored(u)
	for _, k := range []string{"labels", "annotations"} {
		if v, ok := a[k]; ok {
			meta[k] = v
		}
	}
	b, err := yaml.Marshal(map[string]interface{}{
		"apiVersion": u.GetAPIVersion(), "kind": u.GetKind(), "metadata": meta, "spec": u.Object["spec"],
	})
	if err != nil {
		return ""
	}
	return string(b)
}

func sortedKinds() []string {
	out := make([]string, 0, len(definitionKinds))
	for k := range definitionKinds {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func setOf(items []string) map[string]bool {
	out := make(map[string]bool, len(items))
	for _, i := range items {
		out[i] = true
	}
	return out
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
