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
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/oam-dev/kubevela/apis/core.oam.dev/v1beta1"
	"github.com/oam-dev/kubevela/apis/types"
	pkgdef "github.com/oam-dev/kubevela/pkg/definition"
	"github.com/oam-dev/kubevela/pkg/workflow/providers"
	"github.com/oam-dev/kubevela/references/docgen"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"sigs.k8s.io/controller-runtime/pkg/client"

	apisv1 "github.com/kubevela/velaux/pkg/server/interfaces/api/dto/v1"
	"github.com/kubevela/velaux/pkg/server/utils/bcode"
)

// exampleTimeout and exampleLimit bound fetching a definition's example-url.
const (
	exampleTimeout = 5 * time.Second
	exampleLimit   = 256 << 10
)

// DefinitionDoc is a definition's reference documentation, as KubeVela
// generates it for kubevela.io and `vela show`: its description, an example,
// and its parameters as tables. lang is en or zh.
func (d *definitionServiceImpl) DefinitionDoc(ctx context.Context, name, defType, lang string) (*apisv1.DefinitionDocResponse, error) {
	capability, exampleURL, err := d.capabilityOf(ctx, name, defType)
	if err != nil {
		return nil, err
	}
	if exampleURL != "" {
		capability.Example = fetchExample(ctx, exampleURL)
	}
	ref := &docgen.MarkdownReference{Compiler: providers.DefaultCompiler.Get()}
	ref.Client = d.KubeClient
	ref.I18N = &docgen.En
	if lang == "zh" {
		ref.I18N = &docgen.Zh
	}
	doc, err := ref.GenerateMarkdownForCap(ctx, *capability, false)
	if err != nil {
		return nil, bcode.ErrDefinitionDocUnavailable.SetMessage(err.Error())
	}
	return &apisv1.DefinitionDocResponse{Markdown: withoutFrontMatter(doc)}, nil
}

// withoutFrontMatter drops the Docusaurus front matter docgen writes for
// kubevela.io: the page it is shown on already names the definition.
func withoutFrontMatter(doc string) string {
	if !strings.HasPrefix(doc, "---\n") {
		return doc
	}
	if end := strings.Index(doc[4:], "\n---\n"); end >= 0 {
		return strings.TrimLeft(doc[4+end+5:], "\n")
	}
	return doc
}

// DefinitionCUE is a definition as CUE, as vela def get writes it: the file
// it is authored as, with its metadata and template.
func (d *definitionServiceImpl) DefinitionCUE(ctx context.Context, name, defType string) (*apisv1.DefinitionCUEResponse, error) {
	apiVersion, kind, err := getKindAndVersion(defType)
	if err != nil {
		return nil, err
	}
	def := pkgdef.Definition{}
	def.SetAPIVersion(apiVersion)
	def.SetKind(kind)
	if err := d.KubeClient.Get(ctx, client.ObjectKey{Namespace: types.DefaultKubeVelaNS, Name: name}, &def.Unstructured); err != nil {
		if apierrors.IsNotFound(err) {
			return nil, bcode.ErrDefinitionNotFound
		}
		return nil, err
	}
	text, err := def.ToCUEString()
	if err != nil {
		return nil, bcode.ErrDefinitionDocUnavailable.SetMessage(err.Error())
	}
	return &apisv1.DefinitionCUEResponse{CUE: text}, nil
}

// capabilityOf reads a definition as docgen's capability, with its
// example-url taken out: docgen would fetch it with no bound, so the caller
// fetches it instead.
func (d *definitionServiceImpl) capabilityOf(ctx context.Context, name, defType string) (*types.Capability, string, error) {
	key := client.ObjectKey{Namespace: types.DefaultKubeVelaNS, Name: name}
	get := func(obj client.Object) (string, error) {
		if err := d.KubeClient.Get(ctx, key, obj); err != nil {
			if apierrors.IsNotFound(err) {
				return "", bcode.ErrDefinitionNotFound
			}
			return "", err
		}
		annotations := obj.GetAnnotations()
		exampleURL := annotations[types.AnnoDefinitionExampleURL]
		delete(annotations, types.AnnoDefinitionExampleURL)
		obj.SetAnnotations(annotations)
		return exampleURL, nil
	}
	var (
		capability *types.Capability
		exampleURL string
		err        error
	)
	switch defType {
	case "component":
		def := &v1beta1.ComponentDefinition{}
		if exampleURL, err = get(def); err == nil {
			capability, err = docgen.GetCapabilityByComponentDefinitionObject(*def, def.Spec.Workload.Type)
		}
	case "trait":
		def := &v1beta1.TraitDefinition{}
		if exampleURL, err = get(def); err == nil {
			capability, err = docgen.GetCapabilityByTraitDefinitionObject(*def)
		}
	case "workflowstep":
		def := &v1beta1.WorkflowStepDefinition{}
		if exampleURL, err = get(def); err == nil {
			capability, err = docgen.GetCapabilityByWorkflowStepDefinitionObject(*def)
		}
	case "policy":
		def := &v1beta1.PolicyDefinition{}
		if exampleURL, err = get(def); err == nil {
			capability, err = docgen.GetCapabilityByPolicyDefinitionObject(*def)
		}
	default:
		return nil, "", bcode.ErrDefinitionDocUnavailable.SetMessage(fmt.Sprintf("no documentation is generated for %s definitions", defType))
	}
	if err != nil {
		return nil, "", err
	}
	return capability, exampleURL, nil
}

// fetchExample reads a definition's example the way docgen does, a YAML file
// fenced as such, within exampleTimeout and exampleLimit. An example that
// cannot be read is left out.
func fetchExample(ctx context.Context, raw string) string {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return ""
	}
	ctx, cancel := context.WithTimeout(ctx, exampleTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return ""
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return ""
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, exampleLimit))
	if err != nil {
		return ""
	}
	if strings.HasSuffix(u.Path, ".yaml") {
		return fmt.Sprintf("```yaml\n%s\n```", data)
	}
	return string(data)
}
