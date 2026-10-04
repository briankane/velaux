// +title=Unpinned types
// +description=Components and traits that follow their definition's latest version, and the version that is now
// +chart=pie
// +chart:x=type
// +chart:title=Unpinned by type
import (
	"strings"
	"vela/report"
)

template: {
	components:  report.#Components
	definitions: report.#Definitions
	latestOf: {for d in definitions.$returns if d.latest != _|_ {"\(d.kind)/\(d.name)": d.latest}}

	rows: [...{
		// +title=Application
		// +link=/applications/{app}/config/components
		app: string
		// +title=Component
		component: string
		// +title=Kind
		kind: string
		// +title=Type
		type: string
		// +title=Follows now
		latest: string
	}]
	rows: [for c in components.$returns if !strings.Contains(c.type, "@") {
		app:       c.app
		component: c.component
		kind:      c.kind
		type:      c.type
		latest:    [if latestOf["\(c.kind)/\(c.type)"] != _|_ {latestOf["\(c.kind)/\(c.type)"]}, "-"][0]
	}]
}
