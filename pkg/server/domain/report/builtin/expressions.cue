// +title=Expression usage
// +description=Properties that read sources, context or other components through $( ) expressions
// +chart=bar
// +chart:x=reads
// +chart:title=Expressions by what they read
import (
	"strings"
	"vela/report"
)

template: {
	components: report.#Components

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
		// +title=Property
		property: string
		// +title=Expression
		expression: string
		// +title=Reads
		reads: string
	}]
	rows: [for c in components.$returns if c.expressions != _|_ for e in c.expressions {
		app:        c.app
		component:  c.component
		kind:       c.kind
		type:       c.type
		property:   e.property
		expression: e.expression
		reads: [
			if strings.Contains(e.expression, "source.") {"source"},
			if strings.Contains(e.expression, "component.") {"component"},
			if strings.Contains(e.expression, "context.") {"context"},
			"other",
		][0]
	}]
}
