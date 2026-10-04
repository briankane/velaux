// +title=Pinned to a missing version
// +description=Components and traits pinned to a definition version that no longer exists, which cannot render
import (
	"list"
	"strings"
	"vela/report"
)

template: {
	components:  report.#Components
	definitions: report.#Definitions
	versions: {for d in definitions.$returns {"\(d.kind)/\(d.name)": d.versions}}

	rows: [...{
		// +title=Application
		// +link=/applications/{app}/config/components
		app: string
		// +title=Component
		component: string
		// +title=Kind
		kind: string
		// +title=Pinned type
		type: string
	}]
	rows: [for c in components.$returns
		let parts = strings.Split(c.type, "@")
		if len(parts) == 2
		let have = [if versions["\(c.kind)/\(parts[0])"] != _|_ {versions["\(c.kind)/\(parts[0])"]}, []][0]
		if !list.Contains(have, parts[1]) {
			app:       c.app
			component: c.component
			kind:      c.kind
			type:      c.type
		}]
}
