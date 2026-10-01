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

	"github.com/kubevela/pkg/controller/reconciler"
	"github.com/oam-dev/kubevela/apis/core.oam.dev/v1beta1"
	common2 "github.com/oam-dev/kubevela/pkg/utils/common"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	"github.com/kubevela/velaux/pkg/server/utils/bcode"
)

// The status says whether the controller is skipping the Application.
func TestApplicationStatusFromReportsPaused(t *testing.T) {
	paused, err := applicationStatusFrom(application(t, `{
		"apiVersion": "core.oam.dev/v1beta1", "kind": "Application",
		"metadata": {"name": "shop", "labels": {"controller.core.oam.dev/pause": "true"}},
		"status": {"status": "running"}}`))
	require.NoError(t, err)
	require.True(t, paused.Paused)

	running, err := applicationStatusFrom(application(t, `{
		"apiVersion": "core.oam.dev/v1beta1", "kind": "Application",
		"metadata": {"name": "shop", "labels": {"controller.core.oam.dev/pause": "false"}},
		"status": {"status": "running"}}`))
	require.NoError(t, err)
	require.False(t, running.Paused)
}

// Pausing adds the label and resuming removes it, leaving every other label alone.
func TestSetApplicationPaused(t *testing.T) {
	ctx := context.Background()
	app := &v1beta1.Application{ObjectMeta: metav1.ObjectMeta{
		Name: "shop", Namespace: "prod", Labels: map[string]string{"team": "orders"},
	}}
	cli := fake.NewClientBuilder().WithScheme(common2.Scheme).WithObjects(app).Build()
	key := types.NamespacedName{Namespace: "prod", Name: "shop"}

	require.NoError(t, setApplicationPaused(ctx, cli, key, true))
	got := &v1beta1.Application{}
	require.NoError(t, cli.Get(ctx, key, got))
	require.Equal(t, map[string]string{"team": "orders", reconciler.LabelPause: "true"}, got.Labels)

	require.NoError(t, setApplicationPaused(ctx, cli, key, false))
	require.NoError(t, cli.Get(ctx, key, got))
	require.Equal(t, map[string]string{"team": "orders"}, got.Labels)
}

// An orbit that has never been deployed has no Application to pause.
func TestSetApplicationPausedNotDeployed(t *testing.T) {
	cli := fake.NewClientBuilder().WithScheme(common2.Scheme).Build()
	err := setApplicationPaused(context.Background(), cli, types.NamespacedName{Namespace: "prod", Name: "shop"}, true)
	require.ErrorIs(t, err, bcode.ErrApplicationNotDeployed)
}
