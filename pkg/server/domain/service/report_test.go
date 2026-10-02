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

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	common2 "github.com/oam-dev/kubevela/pkg/utils/common"

	"github.com/kubevela/velaux/pkg/server/domain/model"
	"github.com/kubevela/velaux/pkg/server/infrastructure/datastore"
	"github.com/kubevela/velaux/pkg/server/infrastructure/datastore/kubeapi"
	"github.com/kubevela/velaux/pkg/server/utils/bcode"
)

// reportFixture is two projects, shop and other, each with an application, a
// target namespace and a Deployment there.
func reportFixture(t *testing.T) *reportServiceImpl {
	t.Helper()
	ctx := context.Background()
	deploy := func(ns, name, app string) *appsv1.Deployment {
		return &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns, Labels: map[string]string{"app.oam.dev/name": app}}}
	}
	cli := fake.NewClientBuilder().WithScheme(common2.Scheme).
		WithObjects(deploy("shop-prod", "storefront-web", "storefront"), deploy("other-prod", "secret-api", "secret")).Build()
	store, err := kubeapi.New(ctx, datastore.Config{Database: "kubevela"}, cli)
	require.NoError(t, err)
	props := model.JSONStruct{"replicas": "$(source.env.scaling.min)"}
	for _, e := range []datastore.Entity{
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
	return &reportServiceImpl{KubeClient: cli, Store: store, DefinitionService: &definitionServiceImpl{KubeClient: cli}}
}

func reportValues(t *testing.T, svc *reportServiceImpl, project, id, key string) []interface{} {
	t.Helper()
	result, err := svc.RunReport(context.Background(), project, id)
	require.NoError(t, err)
	var out []interface{}
	for _, row := range result.Rows {
		out = append(out, row.Values[key])
	}
	return out
}

func TestReportsSeeOnlyTheirProject(t *testing.T) {
	svc := reportFixture(t)
	assert.Equal(t, []interface{}{"storefront-web"}, reportValues(t, svc, "shop", "unpinned", "component"), "only shop's components")
	assert.Equal(t, []interface{}{"storefront-web"}, reportValues(t, svc, "shop", "inventory", "name"), "only shop's namespaces")
	assert.Equal(t, []interface{}{"replicas"}, reportValues(t, svc, "shop", "expressions", "property"))
	assert.Equal(t, []interface{}{"secret-api"}, reportValues(t, svc, "other", "unpinned", "component"))
}

func TestPrunedReportFindsMissingRevisions(t *testing.T) {
	svc := reportFixture(t)
	assert.Equal(t, []interface{}{"cpuscaler@v9"}, reportValues(t, svc, "shop", "pruned", "type"), "a pin to a revision that does not exist")
}

func TestUnknownReport(t *testing.T) {
	svc := reportFixture(t)
	_, err := svc.RunReport(context.Background(), "shop", "nope")
	assert.Equal(t, bcode.ErrReportNotFound, err)
	assert.Len(t, svc.ListReports(), 6)
}
