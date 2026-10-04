// Package vela/report reads the project a report runs over, and nothing else.

// #Apps are the project's applications.
#Apps: {
	#do:       "apps"
	#provider: "report"
	$params: {}
	$returns?: [...{
		name:         string
		alias?:       string
		description?: string
	}]
}

// #Components are the components and traits of the project's applications,
// with the $( ) expressions their properties hold.
#Components: {
	#do:       "components"
	#provider: "report"
	$params: {}
	$returns?: [...{
		app:       string
		component: string
		kind:      "component" | "trait"
		type:      string
		properties?: {...}
		expressions?: [...{property: string, expression: string}]
	}]
}

// #Runs are the workflow runs of the project's applications.
#Runs: {
	#do:       "runs"
	#provider: "report"
	$params: {}
	$returns?: [...{
		app:       string
		env?:      string
		workflow:  string
		name:      string
		status:    string
		started?:  string
		finished?: string
		steps?: [...{name: string, alias?: string, type?: string, phase: string, message?: string}]
	}]
}

// #Definitions are the component and trait definitions: the latest version of
// each and the versions it still has.
#Definitions: {
	#do:       "definitions"
	#provider: "report"
	$params: {}
	$returns?: [...{
		name:    string
		kind:    "component" | "trait"
		latest?: string
		versions: [...string]
	}]
}

// #List lists a kind in each of the project's namespaces, read as the project.
#List: {
	#do:       "list"
	#provider: "report"
	$params: {
		apiVersion: string
		kind:       string
	}
	$returns?: [...{
		cluster:   string
		namespace: string
		object: {...}
	}]
}
