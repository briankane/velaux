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

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	apisv1 "github.com/kubevela/velaux/pkg/server/interfaces/api/dto/v1"
)

const mysqlTemplate = `package mysql

#Table: {
	name: string
	// rows is an estimate.
	rows?: int
}

// ListTables lists the tables in a database.
#ListTables: {
	#do:       "list-tables"
	#provider: "mysql"
	$params: {
		// +usage=The connection string
		conn: string
		db:   *"default" | string
	}
	$returns: [...#Table]
}
`

func TestParsePackage(t *testing.T) {
	got, err := parsePackage(map[string]string{"mysql.cue": mysqlTemplate})
	require.NoError(t, err)
	assert.Equal(t, "mysql", got.name)

	require.Len(t, got.functions, 1)
	fn := got.functions[0]
	assert.Equal(t, "#ListTables", fn.Name)
	assert.Equal(t, "list-tables", fn.Do)
	assert.Equal(t, "mysql", fn.Provider)
	assert.Equal(t, "ListTables lists the tables in a database.", fn.Description)
	assert.Equal(t, []*apisv1.PackageField{
		{Name: "conn", Type: "string", Description: "The connection string"},
		{Name: "db", Type: `*"default" | string`},
	}, fn.Params)
	assert.Empty(t, fn.Returns, "a list is a type, not fields")
	assert.Equal(t, "[...#Table]", fn.ReturnsType)
	assert.Equal(t, "mysql.#ListTables & {\n\t$params: {\n\t\tconn: \"\"\n\t}\n}", fn.Usage,
		"the usage fills the required parameters only")

	require.Len(t, got.types, 1)
	typ := got.types[0]
	assert.Equal(t, "#Table", typ.Name)
	assert.Equal(t, []*apisv1.PackageField{
		{Name: "name", Type: "string"},
		{Name: "rows", Type: "int", Optional: true, Description: "rows is an estimate."},
	}, typ.Fields)
}

// A package's files are one package: their declarations are listed in file
// order, and a file that does not parse is reported, not fatal.
func TestParsePackageFiles(t *testing.T) {
	got, err := parsePackage(map[string]string{
		"b.cue": "package ext\n#Second: {#do: \"two\", #provider: \"ext\", $params: {}, $returns: {}}\n",
		"a.cue": "package ext\n#First: {#do: \"one\", #provider: \"ext\", $params: {x: string}, $returns: {y: int}}\n",
	})
	require.NoError(t, err)
	var names []string
	for _, f := range got.functions {
		names = append(names, f.Name)
	}
	assert.Equal(t, []string{"#First", "#Second"}, names)
	assert.Equal(t, []*apisv1.PackageField{{Name: "y", Type: "int"}}, got.functions[0].Returns)

	_, err = parsePackage(map[string]string{"bad.cue": "package ext\n#Broken: {"})
	assert.Error(t, err)
}
