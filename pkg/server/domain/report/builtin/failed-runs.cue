// +title=Failed workflow runs
// +description=Workflow runs that failed or were terminated, and the step that stopped them
// +chart=bar
// +chart:x=day
// +chart:group=status
// +chart:title=Failed runs per day
import (
	"list"
	"strings"
	"vela/report"
)

template: {
	parameter: {
		// +usage=Include terminated runs as well as failed ones
		terminated: *true | bool
	}
	runs: report.#Runs

	rows: [...{
		// +title=Application
		// +link=/applications/{app}/config
		app: string
		// +title=Run
		// +link=/applications/{app}/envbinding/{env}/workflow/records/{run}
		run: string
		// +title=Status
		// +format=badge
		status: string
		// +title=Failed step
		step: string
		// +title=Message
		message: string
		// +title=Finished
		// +format=time
		finished: string
		env:      string
		day:      string
	}]
	rows: list.Sort([for r in runs.$returns if r.status == "failed" || (parameter.terminated && r.status == "terminated")
		let failed = [for s in *r.steps | [] if s.phase == "failed" {s}]
		let at = [if r.finished != _|_ {r.finished}, if r.started != _|_ {r.started}, ""][0] {
			app:      r.app
			run:      r.name
			status:   r.status
			step:     [if len(failed) > 0 {failed[0].name}, ""][0]
			message:  [if len(failed) > 0 && failed[0].message != _|_ {failed[0].message}, ""][0]
			finished: at
			env:      [if r.env != _|_ {r.env}, ""][0]
			day:      [if len(at) >= 10 {strings.SliceRunes(at, 0, 10)}, "-"][0]
		}], {x: {}, y: {}, less: x.finished > y.finished})
}
