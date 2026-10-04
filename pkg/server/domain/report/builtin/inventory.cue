// +title=Resource inventory
// +description=Workloads, services, config maps and autoscalers in the project's namespaces
// +chart=pie
// +chart:x=kind
// +chart:title=Resources by kind
import (
	"strings"
	"vela/report"
)

template: {
	deployments:  report.#List & {$params: {apiVersion: "apps/v1", kind: "Deployment"}}
	statefulsets: report.#List & {$params: {apiVersion: "apps/v1", kind: "StatefulSet"}}
	services:     report.#List & {$params: {apiVersion: "v1", kind: "Service"}}
	configmaps:   report.#List & {$params: {apiVersion: "v1", kind: "ConfigMap"}}
	autoscalers:  report.#List & {$params: {apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler"}}

	#Row: {
		k:    string
		item: {cluster: string, namespace: string, object: {...}}
		st:   string
		out: {
			kind:      k
			name:      item.object.metadata.name
			namespace: "\(item.cluster)/\(item.namespace)"
			app:       [if item.object.metadata.labels["app.oam.dev/name"] != _|_ {item.object.metadata.labels["app.oam.dev/name"]}, ""][0]
			status:    st
		}
	}
	#ready: {
		s: {...}
		out: "\([if s.readyReplicas != _|_ {s.readyReplicas}, 0][0])/\([if s.replicas != _|_ {s.replicas}, 0][0]) ready"
	}

	rows: [...{
		// +title=Kind
		kind: string
		// +title=Name
		name: string
		// +title=Namespace
		namespace: string
		// +title=Application
		// +link=/applications/{app}/config
		app: string
		// +title=Status
		status: string
	}]
	rows: [
		for d in deployments.$returns {(#Row & {k: "Deployment", item: d, st: (#ready & {s: *d.object.status | {}}).out}).out},
		for s in statefulsets.$returns {(#Row & {k: "StatefulSet", item: s, st: (#ready & {s: *s.object.status | {}}).out}).out},
		for s in services.$returns {(#Row & {k: "Service", item: s, st: [if s.object.spec.type != _|_ {s.object.spec.type}, ""][0]}).out},
		// The cluster's CA bundle and KubeVela's workflow state are in every namespace.
		for c in configmaps.$returns if c.object.metadata.name != "kube-root-ca.crt" && !strings.HasPrefix(c.object.metadata.name, "workflow-") {
			(#Row & {k: "ConfigMap", item: c, st: "\(len([if c.object.data != _|_ {c.object.data}, {}][0])) keys"}).out
		},
		for h in autoscalers.$returns {(#Row & {k: "HorizontalPodAutoscaler", item: h, st: "\([if h.object.status.currentReplicas != _|_ {h.object.status.currentReplicas}, 0][0]) replicas"}).out},
	]
}
