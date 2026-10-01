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
	"testing"

	"github.com/oam-dev/kubevela/apis/core.oam.dev/common"
	"github.com/oam-dev/kubevela/apis/core.oam.dev/v1beta1"
	"github.com/oam-dev/kubevela/pkg/oam"
	common2 "github.com/oam-dev/kubevela/pkg/utils/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	"github.com/kubevela/velaux/pkg/server/domain/model"
	apisv1 "github.com/kubevela/velaux/pkg/server/interfaces/api/dto/v1"
)

// oneEnv binds an application to a single deployed Application.
type oneEnv struct {
	EnvBindingService
	namespace, name string
}

func (o oneEnv) GetEnvBindings(context.Context, *model.Application) ([]*apisv1.EnvBindingBase, error) {
	return []*apisv1.EnvBindingBase{{Name: "prod", AppDeployNamespace: o.namespace, AppDeployName: o.name}}, nil
}

// shop is a deployed Application whose db component applied a ConfigMap
// workload and a route trait resource, as its ResourceTracker records them.
func shopExpressionService(t *testing.T) *expressionServiceImpl {
	t.Helper()
	app := &v1beta1.Application{
		ObjectMeta: metav1.ObjectMeta{Name: "shop", Namespace: "prod"},
		Spec: v1beta1.ApplicationSpec{Components: []common.ApplicationComponent{
			{Name: "db", Type: "k8s-objects"}, {Name: "api", Type: "webservice"},
		}},
	}
	rt := &v1beta1.ResourceTracker{
		ObjectMeta: metav1.ObjectMeta{Name: "shop-v1-prod", Labels: map[string]string{
			oam.LabelAppName: "shop", oam.LabelAppNamespace: "prod",
		}},
		Spec: v1beta1.ResourceTrackerSpec{Type: v1beta1.ResourceTrackerTypeVersioned, ManagedResources: []v1beta1.ManagedResource{
			{
				ClusterObjectReference: common.ClusterObjectReference{ObjectReference: corev1.ObjectReference{APIVersion: "v1", Kind: "ConfigMap", Namespace: "prod", Name: "db"}},
				OAMObjectReference:     common.OAMObjectReference{Component: "db"},
			},
			{
				ClusterObjectReference: common.ClusterObjectReference{ObjectReference: corev1.ObjectReference{APIVersion: "v1", Kind: "Service", Namespace: "prod", Name: "db-route"}},
				OAMObjectReference:     common.OAMObjectReference{Component: "db", Trait: "expose"},
			},
		}},
	}
	workload := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "db", Namespace: "prod"},
		Data:       map[string]string{"host": "db.internal", "port": "5432"},
	}
	route := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "db-route", Namespace: "prod", Labels: map[string]string{oam.TraitResource: "route"}},
		Spec:       corev1.ServiceSpec{ClusterIP: "10.0.0.7"},
	}
	cli := fake.NewClientBuilder().WithScheme(common2.Scheme).WithObjects(app, rt, workload, route).Build()
	return &expressionServiceImpl{enabled: true, KubeClient: cli, EnvBindingService: oneEnv{namespace: "prod", name: "shop"}}
}

func root(env *apisv1.ExpressionEnvResponse, name string) *apisv1.ExpressionVariable {
	for _, v := range env.Variables {
		if v.Name == name {
			return v
		}
	}
	return nil
}

func child(v *apisv1.ExpressionVariable, path ...string) *apisv1.ExpressionVariable {
	for _, name := range path {
		if v == nil {
			return nil
		}
		var next *apisv1.ExpressionVariable
		for _, c := range v.Children {
			if c.Name == name {
				next = c
			}
		}
		v = next
	}
	return v
}

// A component reads the other components' live output and trait resources, not
// its own.
func TestExpressionEnvReadsComponents(t *testing.T) {
	svc := shopExpressionService(t)
	app := &model.Application{Name: "shop", Annotations: map[string]string{oam.AnnotationCelExpressions: "true"}}

	env, err := svc.Env(context.Background(), app, "component", "", "api")
	require.NoError(t, err)
	components := root(env, "component")
	require.NotNil(t, components)
	var names []string
	for _, c := range components.Children {
		names = append(names, c.Name)
	}
	assert.Equal(t, []string{"db"}, names, "a component does not read itself")

	host := child(components, "db", "output", "data", "host")
	require.NotNil(t, host, "the workload's live fields are offered")
	assert.Equal(t, "string", host.Type)
	assert.Empty(t, host.Schema, "a live field offers its type, never its value")
	assert.Equal(t, "string", child(components, "db", "outputs", "route", "spec", "clusterIP").Type)
	assert.Nil(t, child(components, "db", "output", "metadata", "managedFields"))

	trait, err := svc.Env(context.Background(), app, "trait", "", "db")
	require.NoError(t, err)
	var traitReads []string
	for _, c := range root(trait, "component").Children {
		traitReads = append(traitReads, c.Name)
	}
	assert.Equal(t, []string{"api"}, traitReads, "a trait reads the other components, not its own")

	src, err := svc.Env(context.Background(), app, "source", "first", "")
	require.NoError(t, err)
	assert.Nil(t, root(src, "component"), "a source cannot read a component")
}

// The check refuses a component read where the controller would.
func TestExpressionCheckComponentReads(t *testing.T) {
	svc := shopExpressionService(t)
	app := &model.Application{Name: "shop", Annotations: map[string]string{oam.AnnotationCelExpressions: "true"}}
	check := func(surface, component, value string) []string {
		got, err := svc.Check(context.Background(), app, apisv1.ExpressionCheckRequest{Surface: surface, Component: component, Value: value})
		require.NoError(t, err)
		var msgs []string
		for _, i := range got.Issues {
			msgs = append(msgs, i.Message)
		}
		return msgs
	}
	assert.Empty(t, check("component", "api", "$(component.db.output.data.host)"))
	assert.Empty(t, check("trait", "api", `$(component.db.cluster("east").output.data.host)`))
	assert.Equal(t, []string{"a component cannot read its own output"}, check("component", "db", "$(component.db.output.data.host)"))
	assert.Equal(t, []string{"no component named cache"}, check("component", "api", "$(component.cache.output)"))
	assert.Equal(t, []string{"only component and trait properties can read component.<name>"},
		check("workflowstep", "", "$(component.db.output.data.host)"))
}
