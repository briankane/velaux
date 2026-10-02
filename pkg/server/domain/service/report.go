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
	"sort"
	"strings"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv1 "k8s.io/api/autoscaling/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	k8stypes "k8s.io/apimachinery/pkg/types"
	"k8s.io/klog/v2"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"github.com/oam-dev/kubevela/apis/core.oam.dev/v1beta1"
	"github.com/oam-dev/kubevela/apis/types"
	"github.com/oam-dev/kubevela/pkg/multicluster"
	"github.com/oam-dev/kubevela/pkg/oam"

	"github.com/kubevela/velaux/pkg/server/domain/model"
	"github.com/kubevela/velaux/pkg/server/infrastructure/datastore"
	apisv1 "github.com/kubevela/velaux/pkg/server/interfaces/api/dto/v1"
	"github.com/kubevela/velaux/pkg/server/utils/bcode"
)

// ReportService runs the built-in reports, each over one project alone.
type ReportService interface {
	ListReports() []apisv1.ReportMeta
	RunReport(ctx context.Context, project, id string) (*apisv1.ReportResult, error)
}

type reportServiceImpl struct {
	KubeClient        client.Client       `inject:"kubeClient"`
	Store             datastore.DataStore `inject:"datastore"`
	DefinitionService DefinitionService   `inject:""`
}

// NewReportService is the built-in reports.
func NewReportService() ReportService {
	return &reportServiceImpl{}
}

// report is one built-in report: what it is, and how it runs over a project.
type report struct {
	meta apisv1.ReportMeta
	run  func(r *reportServiceImpl, ctx context.Context, p *projectScope) (*apisv1.ReportResult, error)
}

var reports = []report{
	{apisv1.ReportMeta{ID: "unpinned", Title: "Unpinned types", Description: "Components and traits that follow their definition's latest version, and the version that is"}, (*reportServiceImpl).unpinned},
	{apisv1.ReportMeta{ID: "pruned", Title: "Pinned to a missing version", Description: "Components and traits pinned to a definition revision that no longer exists, which cannot render"}, (*reportServiceImpl).pruned},
	{apisv1.ReportMeta{ID: "failed-runs", Title: "Failed workflow runs", Description: "Workflow runs that failed or were terminated, and the step that stopped them"}, (*reportServiceImpl).failedRuns},
	{apisv1.ReportMeta{ID: "inventory", Title: "Resource inventory", Description: "Workloads, services, config maps and autoscalers in the project's namespaces"}, (*reportServiceImpl).inventory},
	{apisv1.ReportMeta{ID: "expressions", Title: "Expression usage", Description: "Properties that read sources, context or other components through $( ) expressions"}, (*reportServiceImpl).expressions},
	{apisv1.ReportMeta{ID: "autoscaling", Title: "Autoscaling", Description: "Each autoscaler's replicas against its bounds, and CPU against its target"}, (*reportServiceImpl).autoscaling},
}

// ListReports is the catalogue of built-in reports.
func (r *reportServiceImpl) ListReports() []apisv1.ReportMeta {
	out := make([]apisv1.ReportMeta, 0, len(reports))
	for _, rep := range reports {
		out = append(out, rep.meta)
	}
	return out
}

// RunReport runs a report over one project: its applications, and the
// namespaces its targets deploy to, and nothing else.
func (r *reportServiceImpl) RunReport(ctx context.Context, project, id string) (*apisv1.ReportResult, error) {
	for _, rep := range reports {
		if rep.meta.ID != id {
			continue
		}
		scope, err := r.scope(ctx, project)
		if err != nil {
			return nil, err
		}
		result, err := rep.run(r, ctx, scope)
		if err != nil {
			return nil, err
		}
		// An empty report is an empty table, not a missing one.
		if result.Rows == nil {
			result.Rows = []apisv1.ReportRow{}
		}
		result.Report = rep.meta
		result.Project = project
		result.GeneratedAt = time.Now()
		return result, nil
	}
	return nil, bcode.ErrReportNotFound
}

// projectScope is what a report may read for a project: its applications and
// the namespaces, by cluster, its targets deploy to.
type projectScope struct {
	name       string
	apps       []*model.Application
	namespaces []clusterNamespace
}

type clusterNamespace struct {
	cluster   string
	namespace string
}

func (r *reportServiceImpl) scope(ctx context.Context, project string) (*projectScope, error) {
	scope := &projectScope{name: project}
	apps, err := r.Store.List(ctx, &model.Application{Project: project}, nil)
	if err != nil {
		return nil, err
	}
	for _, e := range apps {
		if app, ok := e.(*model.Application); ok && app.Project == project {
			scope.apps = append(scope.apps, app)
		}
	}
	targets, err := r.Store.List(ctx, &model.Target{Project: project}, nil)
	if err != nil {
		return nil, err
	}
	seen := map[clusterNamespace]bool{}
	for _, e := range targets {
		t, ok := e.(*model.Target)
		if !ok || t.Project != project || t.Cluster == nil || t.Cluster.Namespace == "" {
			continue
		}
		ns := clusterNamespace{cluster: t.Cluster.ClusterName, namespace: t.Cluster.Namespace}
		if !seen[ns] {
			seen[ns] = true
			scope.namespaces = append(scope.namespaces, ns)
		}
	}
	sort.Slice(scope.namespaces, func(i, j int) bool {
		return scope.namespaces[i].cluster+scope.namespaces[i].namespace < scope.namespaces[j].cluster+scope.namespaces[j].namespace
	})
	return scope, nil
}

// typed is a component or trait of an application, as the type-based reports
// walk them.
type typed struct {
	app, component, kind, typ string
	properties                *model.JSONStruct
}

func (r *reportServiceImpl) typedOf(ctx context.Context, scope *projectScope) ([]typed, error) {
	var out []typed
	for _, app := range scope.apps {
		comps, err := r.Store.List(ctx, &model.ApplicationComponent{AppPrimaryKey: app.PrimaryKey()}, nil)
		if err != nil {
			return nil, err
		}
		for _, e := range comps {
			c, ok := e.(*model.ApplicationComponent)
			if !ok {
				continue
			}
			out = append(out, typed{app: app.Name, component: c.Name, kind: "component", typ: c.Type, properties: c.Properties})
			for _, t := range c.Traits {
				out = append(out, typed{app: app.Name, component: c.Name, kind: "trait", typ: t.Type, properties: t.Properties})
			}
		}
	}
	return out, nil
}

func componentLink(app string) string {
	return fmt.Sprintf("/applications/%s/config/components", app)
}

func (r *reportServiceImpl) unpinned(ctx context.Context, scope *projectScope) (*apisv1.ReportResult, error) {
	items, err := r.typedOf(ctx, scope)
	if err != nil {
		return nil, err
	}
	latest := map[string]string{}
	result := &apisv1.ReportResult{Columns: columns("app:Application", "component:Component", "kind:Kind", "type:Type", "latest:Follows now")}
	byType := map[string]float64{}
	for _, it := range items {
		if strings.Contains(it.typ, "@") {
			continue
		}
		key := it.kind + "/" + it.typ
		if _, done := latest[key]; !done {
			latest[key] = "-"
			if revs, err := r.DefinitionService.ListDefinitionRevisions(ctx, it.typ, it.kind); err == nil && len(revs) > 0 {
				latest[key] = revs[0].Version
			}
		}
		byType[it.typ]++
		result.Rows = append(result.Rows, apisv1.ReportRow{
			Values: map[string]interface{}{"app": it.app, "component": it.component, "kind": it.kind, "type": it.typ, "latest": latest[key]},
			Link:   componentLink(it.app),
		})
	}
	result.Chart = barChart("Unpinned by type", byType)
	return result, nil
}

func (r *reportServiceImpl) pruned(ctx context.Context, scope *projectScope) (*apisv1.ReportResult, error) {
	items, err := r.typedOf(ctx, scope)
	if err != nil {
		return nil, err
	}
	result := &apisv1.ReportResult{Columns: columns("app:Application", "component:Component", "kind:Kind", "type:Pinned type")}
	for _, it := range items {
		name, version, pinned := strings.Cut(it.typ, "@")
		if !pinned {
			continue
		}
		rev := &v1beta1.DefinitionRevision{}
		err := r.KubeClient.Get(ctx, k8stypes.NamespacedName{Namespace: types.DefaultKubeVelaNS, Name: name + "-" + version}, rev)
		if err == nil {
			continue
		}
		if !apierrors.IsNotFound(err) {
			return nil, err
		}
		result.Rows = append(result.Rows, apisv1.ReportRow{
			Values: map[string]interface{}{"app": it.app, "component": it.component, "kind": it.kind, "type": it.typ},
			Link:   componentLink(it.app),
		})
	}
	return result, nil
}

func (r *reportServiceImpl) failedRuns(ctx context.Context, scope *projectScope) (*apisv1.ReportResult, error) {
	result := &apisv1.ReportResult{Columns: columns("app:Application", "run:Run", "status:Status", "step:Failed step", "message:Message", "finished:Finished")}
	perDay := map[string]float64{}
	envOf := map[string]string{}
	for _, app := range scope.apps {
		records, err := r.Store.List(ctx, &model.WorkflowRecord{AppPrimaryKey: app.PrimaryKey()}, nil)
		if err != nil {
			return nil, err
		}
		for _, e := range records {
			rec, ok := e.(*model.WorkflowRecord)
			if !ok || (rec.Status != "failed" && rec.Status != "terminated") {
				continue
			}
			step, message := "", ""
			for _, s := range rec.Steps {
				if string(s.Phase) == "failed" {
					step, message = s.Name, s.Message
					break
				}
			}
			key := app.Name + "/" + rec.WorkflowName
			if _, done := envOf[key]; !done {
				wf := &model.Workflow{AppPrimaryKey: app.PrimaryKey(), Name: rec.WorkflowName}
				if err := r.Store.Get(ctx, wf); err == nil {
					envOf[key] = wf.EnvName
				}
			}
			link := ""
			if env := envOf[key]; env != "" {
				link = fmt.Sprintf("/applications/%s/envbinding/%s/workflow/records/%s", app.Name, env, rec.Name)
			}
			finished := rec.EndTime
			if finished.IsZero() || finished.Year() < 2000 {
				finished = rec.StartTime
			}
			perDay[finished.Format("2006-01-02")]++
			result.Rows = append(result.Rows, apisv1.ReportRow{
				Values: map[string]interface{}{"app": app.Name, "run": rec.Name, "status": rec.Status, "step": step, "message": message, "finished": finished.Format(time.RFC3339)},
				Link:   link,
			})
		}
	}
	sort.Slice(result.Rows, func(i, j int) bool {
		return fmt.Sprint(result.Rows[i].Values["finished"]) > fmt.Sprint(result.Rows[j].Values["finished"])
	})
	result.Chart = barChart("Failed runs per day", perDay)
	return result, nil
}

// inNamespaces lists objects of a kind in each of the project's namespaces.
func (r *reportServiceImpl) inNamespaces(ctx context.Context, scope *projectScope, list client.ObjectList, each func(ns clusterNamespace)) {
	for _, ns := range scope.namespaces {
		cctx := multicluster.ContextWithClusterName(ctx, ns.cluster)
		if err := r.KubeClient.List(cctx, list, client.InNamespace(ns.namespace)); err != nil {
			klog.Warningf("report: list %T in %s/%s: %v", list, ns.cluster, ns.namespace, err)
			continue
		}
		each(ns)
	}
}

func appOf(labels map[string]string) string {
	return labels[oam.LabelAppName]
}

func (r *reportServiceImpl) appLink(scope *projectScope, app string) string {
	for _, a := range scope.apps {
		if a.Name == app {
			return fmt.Sprintf("/applications/%s/config", app)
		}
	}
	return ""
}

func (r *reportServiceImpl) inventory(ctx context.Context, scope *projectScope) (*apisv1.ReportResult, error) {
	result := &apisv1.ReportResult{Columns: columns("kind:Kind", "name:Name", "namespace:Namespace", "app:Application", "status:Status")}
	byKind := map[string]float64{}
	add := func(kind, name string, ns clusterNamespace, labels map[string]string, status string) {
		byKind[kind]++
		app := appOf(labels)
		result.Rows = append(result.Rows, apisv1.ReportRow{
			Values: map[string]interface{}{"kind": kind, "name": name, "namespace": ns.cluster + "/" + ns.namespace, "app": app, "status": status},
			Link:   r.appLink(scope, app),
		})
	}
	var deployments appsv1.DeploymentList
	r.inNamespaces(ctx, scope, &deployments, func(ns clusterNamespace) {
		for _, d := range deployments.Items {
			add("Deployment", d.Name, ns, d.Labels, fmt.Sprintf("%d/%d ready", d.Status.ReadyReplicas, d.Status.Replicas))
		}
	})
	var statefulsets appsv1.StatefulSetList
	r.inNamespaces(ctx, scope, &statefulsets, func(ns clusterNamespace) {
		for _, s := range statefulsets.Items {
			add("StatefulSet", s.Name, ns, s.Labels, fmt.Sprintf("%d/%d ready", s.Status.ReadyReplicas, s.Status.Replicas))
		}
	})
	var services corev1.ServiceList
	r.inNamespaces(ctx, scope, &services, func(ns clusterNamespace) {
		for _, s := range services.Items {
			add("Service", s.Name, ns, s.Labels, string(s.Spec.Type))
		}
	})
	var configmaps corev1.ConfigMapList
	r.inNamespaces(ctx, scope, &configmaps, func(ns clusterNamespace) {
		for _, c := range configmaps.Items {
			// The cluster's CA bundle and KubeVela's workflow state are in every namespace.
			if c.Name == "kube-root-ca.crt" || strings.HasPrefix(c.Name, "workflow-") {
				continue
			}
			add("ConfigMap", c.Name, ns, c.Labels, fmt.Sprintf("%d keys", len(c.Data)))
		}
	})
	var hpas autoscalingv1.HorizontalPodAutoscalerList
	r.inNamespaces(ctx, scope, &hpas, func(ns clusterNamespace) {
		for _, h := range hpas.Items {
			add("HorizontalPodAutoscaler", h.Name, ns, h.Labels, fmt.Sprintf("%d replicas", h.Status.CurrentReplicas))
		}
	})
	result.Chart = barChart("Resources by kind", byKind)
	return result, nil
}

func (r *reportServiceImpl) expressions(ctx context.Context, scope *projectScope) (*apisv1.ReportResult, error) {
	items, err := r.typedOf(ctx, scope)
	if err != nil {
		return nil, err
	}
	result := &apisv1.ReportResult{Columns: columns("app:Application", "component:Component", "kind:Kind", "type:Type", "property:Property", "expression:Expression")}
	reads := map[string]float64{}
	for _, it := range items {
		if it.properties == nil {
			continue
		}
		_ = walkExpressions("", map[string]interface{}(*it.properties), nil, func(path, value string, _ *openapi3.Schema) error {
			for _, root := range []string{"source.", "context.", "component."} {
				if strings.Contains(value, root) {
					reads[strings.TrimSuffix(root, ".")]++
				}
			}
			result.Rows = append(result.Rows, apisv1.ReportRow{
				Values: map[string]interface{}{"app": it.app, "component": it.component, "kind": it.kind, "type": it.typ, "property": path, "expression": value},
				Link:   componentLink(it.app),
			})
			return nil
		})
	}
	result.Chart = barChart("Expressions by what they read", reads)
	return result, nil
}

func (r *reportServiceImpl) autoscaling(ctx context.Context, scope *projectScope) (*apisv1.ReportResult, error) {
	result := &apisv1.ReportResult{Columns: columns("name:Autoscaler", "app:Application", "namespace:Namespace", "replicas:Replicas", "bounds:Min-max", "cpu:CPU now / target")}
	current := map[string]float64{}
	var hpas autoscalingv1.HorizontalPodAutoscalerList
	r.inNamespaces(ctx, scope, &hpas, func(ns clusterNamespace) {
		for _, h := range hpas.Items {
			min := int32(1)
			if h.Spec.MinReplicas != nil {
				min = *h.Spec.MinReplicas
			}
			cpu := "-"
			if h.Status.CurrentCPUUtilizationPercentage != nil && h.Spec.TargetCPUUtilizationPercentage != nil {
				cpu = fmt.Sprintf("%d%% / %d%%", *h.Status.CurrentCPUUtilizationPercentage, *h.Spec.TargetCPUUtilizationPercentage)
			}
			app := appOf(h.Labels)
			current[h.Name] = float64(h.Status.CurrentReplicas)
			result.Rows = append(result.Rows, apisv1.ReportRow{
				Values: map[string]interface{}{"name": h.Name, "app": app, "namespace": ns.cluster + "/" + ns.namespace, "replicas": h.Status.CurrentReplicas, "bounds": fmt.Sprintf("%d-%d", min, h.Spec.MaxReplicas), "cpu": cpu},
				Link:   r.appLink(scope, app),
			})
		}
	})
	result.Chart = barChart("Replicas now", current)
	return result, nil
}

// columns builds a report's columns from key:title pairs.
func columns(pairs ...string) []apisv1.ReportColumn {
	out := make([]apisv1.ReportColumn, 0, len(pairs))
	for _, p := range pairs {
		key, title, _ := strings.Cut(p, ":")
		out = append(out, apisv1.ReportColumn{Key: key, Title: title})
	}
	return out
}

// barChart is a bar per label, in label order, or none for no data.
func barChart(title string, values map[string]float64) *apisv1.ReportChart {
	if len(values) == 0 {
		return nil
	}
	chart := &apisv1.ReportChart{Title: title}
	for label, value := range values {
		chart.Bars = append(chart.Bars, apisv1.ReportBar{Label: label, Value: value})
	}
	sort.Slice(chart.Bars, func(i, j int) bool { return chart.Bars[i].Label < chart.Bars[j].Label })
	return chart
}
