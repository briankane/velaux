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
	"testing"

	"github.com/oam-dev/kubevela/apis/types"
	"github.com/stretchr/testify/assert"
	v1 "k8s.io/api/core/v1"
)

func TestGeneratedUISchema(t *testing.T) {
	cm := v1.ConfigMap{Data: map[string]string{
		types.DefaultUISchema: `[{"jsonKey":"key","uiType":"Input","conditions":[{"jsonKey":"type","value":"something"}]}]`,
	}}
	ui := generatedUISchema(cm)
	if assert.Len(t, ui, 1) {
		assert.Equal(t, "type", ui[0].Conditions[0].JSONKey)
	}

	assert.Nil(t, generatedUISchema(v1.ConfigMap{}), "a controller that writes none leaves VelaUX to derive the form")
	assert.Nil(t, generatedUISchema(v1.ConfigMap{Data: map[string]string{types.DefaultUISchema: "not json"}}))
}
