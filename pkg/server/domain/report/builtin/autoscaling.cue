// +title=Autoscaling
// +description=Each autoscaler's replicas against its bounds, and CPU against its target
// +chart=bar
// +chart:x=name
// +chart:y=replicas
// +chart:title=Replicas now
import "vela/report"

template: {
	autoscalers: report.#List & {$params: {apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler"}}

	rows: [...{
		// +title=Autoscaler
		name: string
		// +title=Application
		// +link=/applications/{app}/config
		app: string
		// +title=Namespace
		namespace: string
		// +title=Replicas
		replicas: int
		// +title=Min-max
		bounds: string
		// +title=CPU now
		// +format=percent
		cpu: number | *null
		// +title=CPU target
		// +format=percent
		target: number | *null
	}]
	rows: [for h in autoscalers.$returns
		let spec = h.object.spec
		let status = *h.object.status | {} {
			name:      h.object.metadata.name
			app:       [if h.object.metadata.labels["app.oam.dev/name"] != _|_ {h.object.metadata.labels["app.oam.dev/name"]}, ""][0]
			namespace: "\(h.cluster)/\(h.namespace)"
			replicas:  [if status.currentReplicas != _|_ {status.currentReplicas}, 0][0]
			bounds:    "\([if spec.minReplicas != _|_ {spec.minReplicas}, 1][0])-\(spec.maxReplicas)"
			cpu:       [if status.currentCPUUtilizationPercentage != _|_ {status.currentCPUUtilizationPercentage}, null][0]
			target:    [if spec.targetCPUUtilizationPercentage != _|_ {spec.targetCPUUtilizationPercentage}, null][0]
		}]
}
