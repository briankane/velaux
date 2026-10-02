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
	"testing"

	workflowv1alpha1 "github.com/kubevela/workflow/api/v1alpha1"
	"github.com/oam-dev/kubevela/apis/core.oam.dev/common"
	"github.com/oam-dev/kubevela/apis/core.oam.dev/v1beta1"
	"github.com/oam-dev/kubevela/apis/types"
	"github.com/oam-dev/kubevela/pkg/oam"
	common2 "github.com/oam-dev/kubevela/pkg/utils/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	apisv1 "github.com/kubevela/velaux/pkg/server/interfaces/api/dto/v1"
	"github.com/kubevela/velaux/pkg/server/utils/bcode"
)

func withSteps(app *v1beta1.Application, phases ...string) *v1beta1.Application {
	app.Status.Workflow = &common.WorkflowStatus{}
	for i, name := range []string{defkitRenderStep, defkitReviewStep, defkitApplyStep} {
		if i < len(phases) {
			app.Status.Workflow.Steps = append(app.Status.Workflow.Steps, workflowv1alpha1.WorkflowStepStatus{
				StepStatus: workflowv1alpha1.StepStatus{Name: name, Phase: workflowv1alpha1.WorkflowStepPhase(phases[i])},
			})
		}
	}
	return app
}

func TestDefKitPhase(t *testing.T) {
	src := apisv1.DefKitSource{Git: "https://example.com/defs", Version: "main"}
	for _, tc := range []struct {
		phases []string
		want   string
	}{
		{nil, defkitPhaseRendering},
		{[]string{"running"}, defkitPhaseRendering},
		{[]string{"failed"}, defkitPhaseFailed},
		{[]string{"succeeded", "suspending"}, defkitPhaseReview},
		{[]string{"succeeded", "succeeded"}, defkitPhaseApplying},
		{[]string{"succeeded", "succeeded", "running"}, defkitPhaseApplying},
		{[]string{"succeeded", "succeeded", "succeeded"}, defkitPhaseApplied},
		{[]string{"succeeded", "succeeded", "failed"}, defkitPhaseFailed},
	} {
		app := defkitApplication("defs", src)
		if tc.phases != nil {
			withSteps(app, tc.phases...)
		}
		got, _ := defkitPhase(app)
		assert.Equal(t, tc.want, got, "%v", tc.phases)
	}

	app := withSteps(defkitApplication("defs", src), "succeeded", "succeeded", "succeeded")
	app.Generation, app.Status.ObservedGeneration = 2, 1
	got, _ := defkitPhase(app)
	assert.Equal(t, defkitPhaseRendering, got, "a spec the controller has not seen yet is a new render")
}

func TestDefKitSourceRoundTrips(t *testing.T) {
	src := apisv1.DefKitSource{Git: "https://example.com/defs", Version: "v1", Prefix: "dk-", Types: []string{"trait"}}
	app := defkitApplication("defs", src)
	assert.Equal(t, src, defkitSourceOf(app))
	assert.Equal(t, "defkit-defs", app.Name)
	assert.Equal(t, "defs", app.Labels[defkitModuleLabel])
	assert.Equal(t, types.FromInner, app.Labels[types.LabelSourceOfTruth], "a module is not a service")
}

func installedDefinition(kind, name, description string, labels map[string]string) *v1beta1.TraitDefinition {
	return &v1beta1.TraitDefinition{
		TypeMeta: metav1.TypeMeta{APIVersion: "core.oam.dev/v1beta1", Kind: kind},
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "vela-system", Labels: labels,
			Annotations: map[string]string{"definition.oam.dev/description": description}},
		Spec: v1beta1.TraitDefinitionSpec{Schematic: &common.Schematic{CUE: &common.CUE{Template: "patch: {}"}}},
	}
}

func renderedDefinition(name, description string) map[string]interface{} {
	return map[string]interface{}{
		"apiVersion": "core.oam.dev/v1beta1", "kind": "TraitDefinition",
		"metadata": map[string]interface{}{"name": name,
			"annotations": map[string]interface{}{"definition.oam.dev/description": description}},
		"spec": map[string]interface{}{"schematic": map[string]interface{}{"cue": map[string]interface{}{"template": "patch: {}"}}},
	}
}

// reviewFixture is a module in review: its render renders a new, a changed,
// an unchanged and a conflicting trait, and no longer renders one it installed.
func reviewFixture(t *testing.T) (*defkitServiceImpl, client.Client) {
	t.Helper()
	src := apisv1.DefKitSource{Git: "https://example.com/defs", Version: "main"}
	app := withSteps(defkitApplication("defs", src), "succeeded", "suspending")
	owned := map[string]string{oam.LabelAppName: "defkit-defs", oam.LabelAppNamespace: "vela-system", "oam.dev/render-hash": "x"}

	module, _ := json.Marshal(map[string]interface{}{"name": "defs", "version": "v0.0.0-abc", "source": src})
	defs, _ := json.Marshal([]map[string]interface{}{
		renderedDefinition("fresh", "new one"),
		renderedDefinition("edited", "after"),
		renderedDefinition("same", "same"),
		renderedDefinition("taken", "theirs"),
	})
	render := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "defkit-defs-abc", Namespace: defkitRenderNamespace,
			Labels:      map[string]string{defkitModuleLabel: "defkit-defs"},
			Annotations: map[string]string{defkitRenderedAt: "2026-10-02T01:00:00Z"}},
		Data: map[string]string{defkitKeyModule: string(module), defkitKeyDefinitions: string(defs), defkitKeyErrors: "[]"},
	}
	stale := render.DeepCopy()
	stale.Name = "defkit-defs-old"
	staleModule, _ := json.Marshal(map[string]interface{}{"name": "defs", "source": apisv1.DefKitSource{Git: "https://example.com/defs", Version: "v0"}})
	stale.Data = map[string]string{defkitKeyModule: string(staleModule), defkitKeyDefinitions: "[]"}
	stale.Annotations = map[string]string{defkitRenderedAt: "2026-10-02T02:00:00Z"}

	rt := &v1beta1.ResourceTracker{
		ObjectMeta: metav1.ObjectMeta{Name: "defkit-defs-v1-vela-system", Labels: map[string]string{
			oam.LabelAppName: "defkit-defs", oam.LabelAppNamespace: "vela-system",
		}},
		Spec: v1beta1.ResourceTrackerSpec{Type: v1beta1.ResourceTrackerTypeVersioned},
	}
	for _, name := range []string{"edited", "same", "gone"} {
		rt.Spec.ManagedResources = append(rt.Spec.ManagedResources, v1beta1.ManagedResource{ClusterObjectReference: common.ClusterObjectReference{
			ObjectReference: corev1.ObjectReference{APIVersion: "core.oam.dev/v1beta1", Kind: "TraitDefinition", Namespace: "vela-system", Name: name},
		}})
	}
	cli := fake.NewClientBuilder().WithScheme(common2.Scheme).WithObjects(app, render, stale, rt,
		installedDefinition("TraitDefinition", "edited", "before", owned),
		installedDefinition("TraitDefinition", "same", "same", owned),
		installedDefinition("TraitDefinition", "taken", "theirs", nil),
		installedDefinition("TraitDefinition", "gone", "old", owned),
	).WithStatusSubresource(app).Build()
	return &defkitServiceImpl{KubeClient: cli}, cli
}

func TestDefKitPreview(t *testing.T) {
	svc, _ := reviewFixture(t)
	preview, err := svc.PreviewModule(context.Background(), "defs")
	require.NoError(t, err)
	assert.Equal(t, defkitPhaseReview, preview.Phase)
	require.NotNil(t, preview.Info)
	assert.Equal(t, "v0.0.0-abc", preview.Info.ResolvedVersion, "the render of the current source, not a newer one of another")

	got := map[string]string{}
	for _, item := range preview.Items {
		got[item.Name] = item.Status
	}
	assert.Equal(t, map[string]string{
		"fresh": defkitNew, "edited": defkitChanged, "same": defkitUnchanged, "taken": defkitConflict, "gone": defkitRemoved,
	}, got)
	for _, item := range preview.Items {
		if item.Name == "edited" {
			assert.Contains(t, item.Current, "before")
			assert.Contains(t, item.Next, "after")
			assert.NotContains(t, item.Current, oam.LabelAppName, "what KubeVela stamps is not part of the diff")
		}
	}
}

func TestDefKitApplyPreview(t *testing.T) {
	svc, cli := reviewFixture(t)
	ctx := context.Background()
	require.NoError(t, svc.ApplyPreview(ctx, "defs", apisv1.ApplyDefKitPreviewRequest{
		Delete: []string{"TraitDefinition/gone", "TraitDefinition/same"},
	}))

	cm := &corev1.ConfigMap{}
	require.NoError(t, cli.Get(ctx, client.ObjectKey{Namespace: defkitRenderNamespace, Name: "defkit-defs-abc"}, cm))
	assert.JSONEq(t, `["TraitDefinition/taken"]`, cm.Data[defkitKeySkip], "a conflict not taken over is skipped")

	err := cli.Get(ctx, client.ObjectKey{Namespace: "vela-system", Name: "gone"}, &v1beta1.TraitDefinition{})
	assert.True(t, apierrors.IsNotFound(err), "a ticked removed definition is deleted")
	assert.NoError(t, cli.Get(ctx, client.ObjectKey{Namespace: "vela-system", Name: "same"}, &v1beta1.TraitDefinition{}),
		"only removed definitions can be deleted this way")

	app := &v1beta1.Application{}
	require.NoError(t, cli.Get(ctx, client.ObjectKey{Namespace: "vela-system", Name: "defkit-defs"}, app))
	assert.False(t, app.Status.Workflow.Suspend, "the review step is resumed")

	svc2, cli2 := reviewFixture(t)
	require.NoError(t, svc2.ApplyPreview(ctx, "defs", apisv1.ApplyDefKitPreviewRequest{TakeOver: []string{"TraitDefinition/taken"}}))
	require.NoError(t, cli2.Get(ctx, client.ObjectKey{Namespace: defkitRenderNamespace, Name: "defkit-defs-abc"}, cm))
	assert.JSONEq(t, `[]`, cm.Data[defkitKeySkip], "a conflict taken over is applied")
	assert.NoError(t, cli2.Get(ctx, client.ObjectKey{Namespace: "vela-system", Name: "gone"}, &v1beta1.TraitDefinition{}),
		"an unticked removed definition is kept")
}

func TestDefKitApplyNeedsReview(t *testing.T) {
	svc, cli := reviewFixture(t)
	ctx := context.Background()
	app := &v1beta1.Application{}
	require.NoError(t, cli.Get(ctx, client.ObjectKey{Namespace: "vela-system", Name: "defkit-defs"}, app))
	withSteps(app, "running")
	require.NoError(t, cli.Status().Update(ctx, app))
	assert.Equal(t, bcode.ErrDefKitNotInReview, svc.ApplyPreview(ctx, "defs", apisv1.ApplyDefKitPreviewRequest{}))
}

func TestDefKitCreateNeedsAddonAndOneSource(t *testing.T) {
	ctx := context.Background()
	cli := fake.NewClientBuilder().WithScheme(common2.Scheme).Build()
	svc := &defkitServiceImpl{KubeClient: cli}
	_, err := svc.CreateModule(ctx, apisv1.CreateDefKitModuleRequest{Name: "defs", DefKitSource: apisv1.DefKitSource{Git: "x"}})
	assert.Equal(t, bcode.ErrDefKitAddonDisabled, err)

	for _, name := range []string{defkitRenderStepType, defkitApplyStepType} {
		require.NoError(t, cli.Create(ctx, &v1beta1.WorkflowStepDefinition{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "vela-system"}}))
	}
	_, err = svc.CreateModule(ctx, apisv1.CreateDefKitModuleRequest{Name: "defs", DefKitSource: apisv1.DefKitSource{Git: "x", Ref: "y"}})
	assert.Equal(t, bcode.ErrDefKitNoSource, err)
	m, err := svc.CreateModule(ctx, apisv1.CreateDefKitModuleRequest{Name: "defs", DefKitSource: apisv1.DefKitSource{Git: "x"}})
	require.NoError(t, err)
	assert.Equal(t, defkitPhaseRendering, m.Phase)
	_, err = svc.CreateModule(ctx, apisv1.CreateDefKitModuleRequest{Name: "defs", DefKitSource: apisv1.DefKitSource{Git: "x"}})
	assert.Equal(t, bcode.ErrDefKitModuleExist, err)
}
