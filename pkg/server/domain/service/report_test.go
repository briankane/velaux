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
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv1 "k8s.io/api/autoscaling/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apiserver/pkg/endpoints/request"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	"github.com/oam-dev/kubevela/apis/core.oam.dev/v1beta1"
	common2 "github.com/oam-dev/kubevela/pkg/utils/common"

	"github.com/kubevela/velaux/pkg/server/domain/model"
	"github.com/kubevela/velaux/pkg/server/domain/report"
	"github.com/kubevela/velaux/pkg/server/infrastructure/datastore"
	"github.com/kubevela/velaux/pkg/server/infrastructure/datastore/kubeapi"
	apisv1 "github.com/kubevela/velaux/pkg/server/interfaces/api/dto/v1"
	"github.com/kubevela/velaux/pkg/server/utils"
	"github.com/kubevela/velaux/pkg/server/utils/bcode"
)

func reportConfigMap(namespace, name, src string) *corev1.ConfigMap {
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace, Labels: map[string]string{reportLabel: "true"}},
		Data:       map[string]string{reportTemplateKey: src},
	}
}

const (
	appsReport = `
// +title=%s
import "vela/report"
template: {
	apps: report.#Apps
	rows: [...{
		// +title=Application
		// +link=/applications/{name}/config
		name: string
		// +title=From
		from: string
	}]
	rows: [for a in apps.$returns {name: a.name, from: "%s"}]
}`
	deploymentsReport = `
// +title=Deployments
import "vela/report"
template: {
	parameter: {
		// +usage=Only this one
		name?: string
	}
	d: report.#List & {$params: {apiVersion: "apps/v1", kind: "Deployment"}}
	rows: [...{
		// +title=Name
		name: string
		// +title=Namespace
		namespace: string
	}]
	let want = [if parameter.name != _|_ {parameter.name}, ""][0]
	rows: [for x in d.$returns if want == "" || x.object.metadata.name == want {name: x.object.metadata.name, namespace: x.namespace}]
}`
	componentsReport = `
// +title=Components
import (
	"list"
	"strings"
	"vela/report"
)
template: {
	c:    report.#Components
	defs: report.#Definitions
	versions: {for d in defs.$returns {"\(d.kind)/\(d.name)": d.versions}}
	rows: [...{
		// +title=Component
		component: string
		// +title=Type
		type: string
		// +title=Expressions
		expressions: int
		// +title=Pinned to a missing version
		missing: bool
	}]
	rows: [for x in c.$returns
		let parts = strings.Split(x.type, "@")
		let have = [if versions["\(x.kind)/\(parts[0])"] != _|_ {versions["\(x.kind)/\(parts[0])"]}, []][0] {
			component:   x.component
			type:        x.type
			expressions: [if x.expressions != _|_ {len(x.expressions)}, 0][0]
			missing:     [if len(parts) == 2 {!list.Contains(have, parts[1])}, false][0]
		}]
}`
)

// reportFixture is two projects, shop and other, each with an application, a
// target namespace and a Deployment there; reports local to shop and global
// ones in vela-system. user cannot read vela-system, as a project user who is
// impersonated cannot; server records who each Deployment list ran as.
type reportFixture struct {
	svc      *reportServiceImpl
	listedAs [][]string
}

func newReportFixture(t *testing.T, serverFails bool) *reportFixture {
	t.Helper()
	ctx := context.Background()
	fx := &reportFixture{}
	deploy := func(ns, name, app string) *appsv1.Deployment {
		return &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns, Labels: map[string]string{"app.oam.dev/name": app}}}
	}
	objects := []client.Object{
		deploy("shop-prod", "storefront-web", "storefront"), deploy("other-prod", "secret-api", "secret"),
		reportConfigMap("shop", "apps", fmt.Sprintf(appsReport, "Shop apps", "local")),
		reportConfigMap("vela-system", "apps", fmt.Sprintf(appsReport, "Apps", "global")),
		reportConfigMap("vela-system", "deployments", deploymentsReport),
		reportConfigMap("vela-system", "components", componentsReport),
		reportConfigMap("vela-system", "broken", "template: {"),
		&corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "not-a-report", Namespace: "vela-system"}, Data: map[string]string{reportTemplateKey: "x: 1"}},
		&v1beta1.DefinitionRevision{ObjectMeta: metav1.ObjectMeta{Name: "webapp-v1", Namespace: "vela-system"},
			Spec: v1beta1.DefinitionRevisionSpec{Revision: 1, DefinitionType: "Component", ComponentDefinition: v1beta1.ComponentDefinition{ObjectMeta: metav1.ObjectMeta{Name: "webapp"}}}},
		&v1beta1.ComponentDefinition{ObjectMeta: metav1.ObjectMeta{Name: "webapp", Namespace: "vela-system"}},
	}
	forbidden := apierrors.NewForbidden(schema.GroupResource{Resource: "configmaps"}, "", errors.New("no"))
	user := fake.NewClientBuilder().WithScheme(common2.Scheme).WithObjects(objects...).WithInterceptorFuncs(interceptor.Funcs{
		Get: func(ctx context.Context, c client.WithWatch, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
			if key.Namespace == "vela-system" {
				return forbidden
			}
			return c.Get(ctx, key, obj, opts...)
		},
		List: func(ctx context.Context, c client.WithWatch, list client.ObjectList, opts ...client.ListOption) error {
			if namespaceOf(opts) == "vela-system" {
				return forbidden
			}
			return c.List(ctx, list, opts...)
		},
	}).Build()
	server := fake.NewClientBuilder().WithScheme(common2.Scheme).WithObjects(objects...).WithInterceptorFuncs(interceptor.Funcs{
		Get: func(ctx context.Context, c client.WithWatch, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
			if serverFails && key.Namespace == "vela-system" {
				return forbidden
			}
			return c.Get(ctx, key, obj, opts...)
		},
		List: func(ctx context.Context, c client.WithWatch, list client.ObjectList, opts ...client.ListOption) error {
			if serverFails && namespaceOf(opts) == "vela-system" {
				return forbidden
			}
			if u, ok := list.(interface{ GetKind() string }); ok && u.GetKind() == "DeploymentList" {
				who := []string{"(VelaUX)"}
				if info, ok := request.UserFrom(ctx); ok {
					who = append([]string{info.GetName()}, info.GetGroups()...)
				}
				fx.listedAs = append(fx.listedAs, who)
			}
			return c.List(ctx, list, opts...)
		},
	}).Build()
	store, err := kubeapi.New(ctx, datastore.Config{Database: "kubevela"}, server)
	require.NoError(t, err)
	props := model.JSONStruct{"replicas": "$(source.env.scaling.min)"}
	for _, e := range []datastore.Entity{
		&model.Project{Name: "shop", Namespace: "shop"},
		&model.Project{Name: "other", Namespace: "other"},
		&model.Application{Name: "storefront", Project: "shop"},
		&model.Application{Name: "secret", Project: "other"},
		&model.Target{Name: "shop-prod", Project: "shop", Cluster: &model.ClusterTarget{ClusterName: "local", Namespace: "shop-prod"}},
		&model.Target{Name: "other-prod", Project: "other", Cluster: &model.ClusterTarget{ClusterName: "local", Namespace: "other-prod"}},
		&model.ApplicationComponent{AppPrimaryKey: "storefront", Name: "storefront-web", Type: "webapp", Properties: &props,
			Traits: []model.ApplicationTrait{{Type: "cpuscaler@v9"}}},
		&model.ApplicationComponent{AppPrimaryKey: "secret", Name: "secret-api", Type: "webapp", Properties: &props},
	} {
		require.NoError(t, store.Add(ctx, e))
	}
	fx.svc = &reportServiceImpl{KubeClient: user, ServerKubeClient: server, Store: store}
	return fx
}

func namespaceOf(opts []client.ListOption) string {
	o := &client.ListOptions{}
	o.ApplyOptions(opts)
	return o.Namespace
}

func (fx *reportFixture) run(t *testing.T, project, id string, parameters map[string]interface{}) *apisv1.ReportResult {
	t.Helper()
	res, err := fx.svc.RunReport(utils.WithUsername(context.Background(), "alice"), project, id, parameters)
	require.NoError(t, err)
	return res
}

func column(res *apisv1.ReportResult, key string) []interface{} {
	out := []interface{}{}
	for _, row := range res.Rows {
		out = append(out, row.Values[key])
	}
	return out
}

func TestReportCatalogue(t *testing.T) {
	t.Run("local reports, then global ones, a global one hidden by a local one of its name", func(t *testing.T) {
		list, err := newReportFixture(t, false).svc.ListReports(context.Background(), "shop")
		require.NoError(t, err)
		assert.False(t, list.GlobalUnavailable)
		got := map[string]apisv1.ReportMeta{}
		order := []string{}
		for _, r := range list.Reports {
			got[r.Scope+"/"+r.ID] = r
			order = append(order, r.Scope+"/"+r.ID)
		}
		assert.Equal(t, []string{"local/apps", "global/apps", "global/broken", "global/components", "global/deployments"}, order)
		assert.Equal(t, "Shop apps", got["local/apps"].Title)
		assert.True(t, got["global/apps"].Hidden)
		assert.NotEmpty(t, got["global/broken"].Error, "a report that is not one says why")
		require.Len(t, got["global/deployments"].Parameters, 1, "its parameter form")
		assert.Equal(t, "name", got["global/deployments"].Parameters[0].JSONKey)
	})

	t.Run("global reports that cannot be read leave the project's own", func(t *testing.T) {
		list, err := newReportFixture(t, true).svc.ListReports(context.Background(), "shop")
		require.NoError(t, err)
		assert.True(t, list.GlobalUnavailable)
		require.Len(t, list.Reports, 1)
		assert.Equal(t, "local", list.Reports[0].Scope)
	})
}

func TestReportsSeeOnlyTheirProject(t *testing.T) {
	fx := newReportFixture(t, false)

	res := fx.run(t, "shop", "deployments", nil)
	assert.Equal(t, []interface{}{"storefront-web"}, column(res, "name"), "only shop's namespaces")
	assert.Equal(t, [][]string{{"alice", "kubevela:project:shop", "kubevela:client"}}, fx.listedAs, "listed as the project")

	assert.Equal(t, []interface{}{"storefront-web", "storefront-web"}, column(fx.run(t, "shop", "components", nil), "component"))
	assert.Equal(t, []interface{}{"secret"}, column(fx.run(t, "other", "apps", nil), "name"))
}

func TestRunReport(t *testing.T) {
	fx := newReportFixture(t, false)

	t.Run("a local report runs in place of a global one of its name", func(t *testing.T) {
		res := fx.run(t, "shop", "apps", nil)
		assert.Equal(t, []interface{}{"local"}, column(res, "from"))
		assert.Equal(t, "local", res.Report.Scope)
		assert.Equal(t, "/applications/storefront/config", res.Rows[0].Links["name"])
	})
	t.Run("a global report runs where no local one has its name", func(t *testing.T) {
		assert.Equal(t, []interface{}{"global"}, column(fx.run(t, "other", "apps", nil), "from"))
	})
	t.Run("parameters reach the report", func(t *testing.T) {
		assert.Empty(t, fx.run(t, "shop", "deployments", map[string]interface{}{"name": "nope"}).Rows)
	})
	t.Run("expressions and definitions come with components", func(t *testing.T) {
		res := fx.run(t, "shop", "components", nil)
		assert.Equal(t, []interface{}{int64(1), int64(0)}, column(res, "expressions"))
		assert.Equal(t, []interface{}{false, true}, column(res, "missing"), "webapp has v1; cpuscaler has no v9")
	})
	t.Run("an unknown report is not found", func(t *testing.T) {
		_, err := fx.svc.RunReport(context.Background(), "shop", "nope", nil)
		assert.Equal(t, bcode.ErrReportNotFound, err)
	})
	t.Run("an empty report is an empty table", func(t *testing.T) {
		res := fx.run(t, "shop", "deployments", map[string]interface{}{"name": "nope"})
		assert.NotNil(t, res.Rows)
	})
}

func TestBuiltinReports(t *testing.T) {
	fx := newReportFixture(t, false)
	ctx := context.Background()
	for name, src := range report.Builtins() {
		require.NoError(t, fx.svc.ServerKubeClient.Create(ctx, reportConfigMap("vela-system", "builtin-"+name, src)))
	}
	min, cpu, target := int32(1), int32(80), int32(60)
	for _, obj := range []client.Object{
		&corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: "storefront", Namespace: "shop-prod"}, Spec: corev1.ServiceSpec{Type: corev1.ServiceTypeClusterIP}},
		&autoscalingv1.HorizontalPodAutoscaler{
			ObjectMeta: metav1.ObjectMeta{Name: "storefront-web", Namespace: "shop-prod", Labels: map[string]string{"app.oam.dev/name": "storefront"}},
			Spec:       autoscalingv1.HorizontalPodAutoscalerSpec{MinReplicas: &min, MaxReplicas: 5, TargetCPUUtilizationPercentage: &target},
			Status:     autoscalingv1.HorizontalPodAutoscalerStatus{CurrentReplicas: 2, CurrentCPUUtilizationPercentage: &cpu},
		},
	} {
		require.NoError(t, fx.svc.ServerKubeClient.Create(ctx, obj))
	}
	ended := time.Date(2026, 10, 2, 9, 30, 0, 0, time.UTC)
	for _, e := range []datastore.Entity{
		&model.Workflow{AppPrimaryKey: "storefront", Name: "workflow-production", EnvName: "production"},
		&model.WorkflowRecord{AppPrimaryKey: "storefront", WorkflowName: "workflow-production", Name: "run-1", Status: "failed", EndTime: ended,
			Steps: []model.WorkflowStepStatus{{StepStatus: model.StepStatus{Name: "deploy", Phase: "succeeded"}}, {StepStatus: model.StepStatus{Name: "check", Phase: "failed", Message: "timed out"}}}},
		&model.WorkflowRecord{AppPrimaryKey: "storefront", WorkflowName: "workflow-production", Name: "run-2", Status: "succeeded", EndTime: ended},
		&model.WorkflowRecord{AppPrimaryKey: "secret", WorkflowName: "workflow-production", Name: "run-3", Status: "failed", EndTime: ended},
	} {
		require.NoError(t, fx.svc.Store.Add(ctx, e))
	}

	list, err := fx.svc.ListReports(ctx, "shop")
	require.NoError(t, err)
	for _, r := range list.Reports {
		if strings.HasPrefix(r.ID, "builtin-") {
			assert.Empty(t, r.Error, r.ID)
		}
	}

	t.Run("unpinned", func(t *testing.T) {
		res := fx.run(t, "shop", "builtin-unpinned", nil)
		assert.Equal(t, []interface{}{"webapp"}, column(res, "type"))
		assert.Equal(t, []interface{}{"v1"}, column(res, "latest"))
		assert.Equal(t, "pie", res.Chart.Type)
	})
	t.Run("pruned", func(t *testing.T) {
		assert.Equal(t, []interface{}{"cpuscaler@v9"}, column(fx.run(t, "shop", "builtin-pruned", nil), "type"))
	})
	t.Run("failed runs", func(t *testing.T) {
		res := fx.run(t, "shop", "builtin-failed-runs", nil)
		assert.Equal(t, []interface{}{"run-1"}, column(res, "run"), "only shop's, only failed")
		assert.Equal(t, []interface{}{"check"}, column(res, "step"))
		assert.Equal(t, []interface{}{"timed out"}, column(res, "message"))
		assert.Equal(t, "/applications/storefront/envbinding/production/workflow/records/run-1", res.Rows[0].Links["run"])
		assert.Equal(t, []apisv1.ReportPoint{{Label: "2026-10-02", Values: map[string]float64{"failed": 1}}}, res.Chart.Points)
	})
	t.Run("inventory", func(t *testing.T) {
		res := fx.run(t, "shop", "builtin-inventory", nil)
		assert.ElementsMatch(t, []interface{}{"storefront-web", "storefront", "storefront-web"}, column(res, "name"), "only shop's namespaces")
		assert.ElementsMatch(t, []interface{}{"0/0 ready", "ClusterIP", "2 replicas"}, column(res, "status"))
	})
	t.Run("expressions", func(t *testing.T) {
		res := fx.run(t, "shop", "builtin-expressions", nil)
		assert.Equal(t, []interface{}{"replicas"}, column(res, "property"))
		assert.Equal(t, []interface{}{"source"}, column(res, "reads"))
	})
	t.Run("autoscaling", func(t *testing.T) {
		res := fx.run(t, "shop", "builtin-autoscaling", nil)
		assert.Equal(t, []interface{}{"1-5"}, column(res, "bounds"))
		assert.Equal(t, []interface{}{int64(80)}, column(res, "cpu"))
		assert.Equal(t, []apisv1.ReportPoint{{Label: "storefront-web", Values: map[string]float64{"replicas": 2}}}, res.Chart.Points)
	})
}

func TestReportData(t *testing.T) {
	fx := newReportFixture(t, false)
	ctx := context.Background()
	now := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	fx.svc.now = func() time.Time { return now }
	started := now.Add(-10 * time.Minute)
	for _, e := range []datastore.Entity{
		&model.Env{Name: "production", Project: "shop", Namespace: "shop"},
		&model.EnvBinding{AppPrimaryKey: "storefront", Name: "production"},
		&model.Workflow{AppPrimaryKey: "storefront", Name: "workflow-production", EnvName: "production"},
		&model.ApplicationRevision{AppPrimaryKey: "storefront", Version: "v2", EnvName: "production", Status: "running", DeployUser: "alice", Note: "Bump", TriggerType: "web"},
		&model.WorkflowRecord{AppPrimaryKey: "storefront", WorkflowName: "workflow-production", Name: "run-1", Status: "suspending", StartTime: started, RevisionPrimaryKey: "v2",
			Steps: []model.WorkflowStepStatus{
				{StepStatus: model.StepStatus{Name: "deploy", Phase: "succeeded", FirstExecuteTime: started, LastExecuteTime: started.Add(time.Minute)}},
				{StepStatus: model.StepStatus{Name: "approve", Type: "suspend", Phase: "suspending", FirstExecuteTime: started.Add(time.Minute)}},
			}},
	} {
		require.NoError(t, fx.svc.Store.Add(ctx, e))
	}
	require.NoError(t, fx.svc.ServerKubeClient.Create(ctx, &v1beta1.Application{ObjectMeta: metav1.ObjectMeta{Name: "storefront", Namespace: "shop"}}))
	source, err := fx.svc.projectSource(utils.WithUsername(ctx, "alice"), "shop")
	require.NoError(t, err)

	t.Run("runs carry their revision and how long they and their steps have taken", func(t *testing.T) {
		runs, err := source.Runs(ctx)
		require.NoError(t, err)
		require.Len(t, runs, 1)
		r := runs[0]
		assert.Equal(t, []interface{}{"v2", "alice", "Bump", "web"}, []interface{}{r.Revision, r.User, r.Note, r.Trigger})
		assert.Equal(t, int64(600), r.Seconds, "still going: up to now")
		assert.Equal(t, int64(60), r.Steps[0].Seconds, "finished: start to end")
		assert.Equal(t, int64(540), r.Steps[1].Seconds, "waiting: up to now")
	})

	t.Run("environments say what is deployed and whether the app changed since", func(t *testing.T) {
		envs, err := source.Environments(ctx)
		require.NoError(t, err)
		require.Len(t, envs, 1)
		assert.Equal(t, "v2", envs[0].Revision)
		assert.False(t, envs[0].Edited, "nothing changed after v2")

		comp := &model.ApplicationComponent{AppPrimaryKey: "storefront", Name: "storefront-web"}
		require.NoError(t, fx.svc.Store.Get(ctx, comp))
		time.Sleep(10 * time.Millisecond)
		require.NoError(t, fx.svc.Store.Put(ctx, comp))
		envs, err = source.Environments(ctx)
		require.NoError(t, err)
		assert.True(t, envs[0].Edited, "a component changed after v2")
	})

	t.Run("List reads the environments' namespaces too", func(t *testing.T) {
		apps, err := source.List(ctx, "core.oam.dev/v1beta1", "Application")
		require.NoError(t, err)
		require.Len(t, apps, 1)
		assert.Equal(t, "shop", apps[0].Namespace)
	})
}
