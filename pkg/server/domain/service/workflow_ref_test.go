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
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	wfTypesv1alpha1 "github.com/kubevela/pkg/apis/oam/v1alpha1"
	workflowv1alpha1 "github.com/kubevela/workflow/api/v1alpha1"

	"github.com/kubevela/velaux/pkg/server/domain/model"
)

func TestApplicationWorkflowSpec(t *testing.T) {
	steps := []model.WorkflowStep{{WorkflowStepBase: model.WorkflowStepBase{Name: "deploy", Type: "deploy"}}}

	t.Run("a referenced workflow is written as its ref, with no steps or mode of its own", func(t *testing.T) {
		spec := applicationWorkflowSpec(&model.Workflow{Ref: "release-standard", Steps: steps})
		assert.Equal(t, "release-standard", spec.Ref)
		assert.Empty(t, spec.Steps)
		assert.Nil(t, spec.Mode)
	})

	t.Run("a referenced workflow keeps a mode it sets, over the shared workflow's", func(t *testing.T) {
		spec := applicationWorkflowSpec(&model.Workflow{
			Ref:  "release-standard",
			Mode: wfTypesv1alpha1.WorkflowExecuteMode{Steps: workflowv1alpha1.WorkflowModeDAG},
		})
		assert.Equal(t, "release-standard", spec.Ref)
		assert.Equal(t, workflowv1alpha1.WorkflowModeDAG, spec.Mode.Steps)
	})

	t.Run("a workflow of its own is written as its steps and mode", func(t *testing.T) {
		spec := applicationWorkflowSpec(&model.Workflow{
			Steps: steps,
			Mode:  wfTypesv1alpha1.WorkflowExecuteMode{Steps: workflowv1alpha1.WorkflowModeStep, SubSteps: workflowv1alpha1.WorkflowModeDAG},
		})
		assert.Empty(t, spec.Ref)
		assert.Len(t, spec.Steps, 1)
		assert.Equal(t, workflowv1alpha1.WorkflowModeStep, spec.Mode.Steps)
	})
}

func TestUpdateWorkflowModes(t *testing.T) {
	t.Run("an empty sub-mode defaults to DAG and leaves the mode alone", func(t *testing.T) {
		steps, sub := workflowModes("DAG", "", "")
		assert.Equal(t, "DAG", steps)
		assert.Equal(t, "DAG", sub)
		steps, sub = workflowModes("", "StepByStep", "")
		assert.Equal(t, "StepByStep", steps)
		assert.Equal(t, "StepByStep", sub)
	})
	t.Run("a referenced workflow keeps an empty mode, to follow the shared workflow's", func(t *testing.T) {
		steps, sub := workflowModes("", "", "release-standard")
		assert.Empty(t, steps)
		assert.Empty(t, sub)
	})
}

func TestSharedWorkflowsOf(t *testing.T) {
	workflow := func(namespace, name string) wfTypesv1alpha1.Workflow {
		return wfTypesv1alpha1.Workflow{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace}}
	}
	shared, err := sharedWorkflowsOf(
		[]wfTypesv1alpha1.Workflow{workflow("shop", "release"), workflow("shop", "hotfix")},
		[]wfTypesv1alpha1.Workflow{workflow("vela-system", "release"), workflow("vela-system", "standard")},
	)
	assert.NoError(t, err)
	got := map[string]string{}
	for _, s := range shared {
		got[s.Scope+"/"+s.Name] = fmt.Sprint(s.Hidden)
	}
	assert.Equal(t, map[string]string{
		"local/release":   "false",
		"local/hotfix":    "false",
		"global/release":  "true",
		"global/standard": "false",
	}, got)
	assert.Equal(t, "local", shared[0].Scope, "local ones are listed first")
}
