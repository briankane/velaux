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
	"fmt"
	"sort"
	"strconv"
	"strings"

	"cuelang.org/go/cue/ast"
	"cuelang.org/go/cue/format"
	"cuelang.org/go/cue/parser"
	"cuelang.org/go/cue/token"

	apisv1 "github.com/kubevela/velaux/pkg/server/interfaces/api/dto/v1"
)

// parsedPackage is what a package's files declare.
type parsedPackage struct {
	name      string
	functions []*apisv1.PackageFunction
	types     []*apisv1.PackageType
}

// parsePackage reads a package's files, in name order, for the definitions they
// declare: a function is one holding a #do, which its provider runs, and any
// other is a type. It reads them as written rather than compiling them, since a
// package's files may import packages only the controller has.
func parsePackage(files map[string]string) (*parsedPackage, error) {
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	out := &parsedPackage{}
	for _, name := range names {
		f, err := parser.ParseFile(name, files[name], parser.ParseComments)
		if err != nil {
			return nil, err
		}
		if out.name == "" {
			out.name = f.PackageName()
		}
		for _, decl := range f.Decls {
			field, ok := decl.(*ast.Field)
			if !ok {
				continue
			}
			label := fieldLabel(field.Label)
			if !strings.HasPrefix(label, "#") {
				continue
			}
			description := fieldDoc(field)
			body, isStruct := field.Value.(*ast.StructLit)
			if isStruct && structHasField(body, "#do") {
				out.functions = append(out.functions, packageFunction(out, label, description, body))
				continue
			}
			t := &apisv1.PackageType{Name: label, Description: description}
			if isStruct {
				t.Fields = packageFields(body)
			} else {
				t.Type = exprSource(field.Value)
			}
			out.types = append(out.types, t)
		}
	}
	return out, nil
}

func packageFunction(p *parsedPackage, name, description string, body *ast.StructLit) *apisv1.PackageFunction {
	fn := &apisv1.PackageFunction{Name: name, Description: description}
	for _, elt := range body.Elts {
		f, ok := elt.(*ast.Field)
		if !ok {
			continue
		}
		switch fieldLabel(f.Label) {
		case "#do":
			fn.Do = literalText(f.Value)
		case "#provider":
			fn.Provider = literalText(f.Value)
		case "$params":
			if s, ok := f.Value.(*ast.StructLit); ok {
				fn.Params = packageFields(s)
			} else {
				fn.ParamsType = exprSource(f.Value)
			}
		case "$returns":
			if s, ok := f.Value.(*ast.StructLit); ok {
				fn.Returns = packageFields(s)
			} else {
				fn.ReturnsType = exprSource(f.Value)
			}
		}
	}
	fn.Usage = callExample(p.name, name, fn.Params)
	return fn
}

// callExample is a call of a function with its required parameters left empty.
func callExample(pkg, name string, params []*apisv1.PackageField) string {
	call := name
	if pkg != "" {
		call = pkg + "." + name
	}
	var required []string
	for _, p := range params {
		if !p.Optional && !strings.HasPrefix(p.Type, "*") {
			required = append(required, fmt.Sprintf("\t\t%s: %s", p.Name, paramPlaceholder(p)))
		}
	}
	if len(required) == 0 {
		return call
	}
	return fmt.Sprintf("%s & {\n\t$params: {\n%s\n\t}\n}", call, strings.Join(required, "\n"))
}

func paramPlaceholder(f *apisv1.PackageField) string {
	switch {
	case len(f.Fields) > 0:
		return "{}"
	case f.Type == "string":
		return `""`
	case f.Type == "int" || f.Type == "number" || f.Type == "float":
		return "0"
	case f.Type == "bool":
		return "false"
	case strings.HasPrefix(f.Type, "["):
		return "[]"
	}
	return "_"
}

// packageFields lists a struct's fields, nested structs as their own fields.
func packageFields(s *ast.StructLit) []*apisv1.PackageField {
	var out []*apisv1.PackageField
	for _, elt := range s.Elts {
		f, ok := elt.(*ast.Field)
		if !ok {
			continue
		}
		name := fieldLabel(f.Label)
		if name == "" || strings.HasPrefix(name, "_") {
			continue
		}
		pf := &apisv1.PackageField{
			Name:        name,
			Optional:    f.Constraint == token.OPTION,
			Description: fieldDoc(f),
		}
		if inner, ok := f.Value.(*ast.StructLit); ok && len(inner.Elts) > 0 {
			pf.Fields = packageFields(inner)
		} else {
			pf.Type = exprSource(f.Value)
		}
		out = append(out, pf)
	}
	return out
}

func structHasField(s *ast.StructLit, name string) bool {
	for _, elt := range s.Elts {
		if f, ok := elt.(*ast.Field); ok && fieldLabel(f.Label) == name {
			return true
		}
	}
	return false
}

// fieldLabel is a field's name as a definition writes it after the dot.
func fieldLabel(l ast.Label) string {
	switch v := l.(type) {
	case *ast.Ident:
		return v.Name
	case *ast.BasicLit:
		if s, err := strconv.Unquote(v.Value); err == nil {
			return s
		}
		return v.Value
	}
	return ""
}

func literalText(e ast.Expr) string {
	if lit, ok := e.(*ast.BasicLit); ok && lit.Kind == token.STRING {
		if s, err := strconv.Unquote(lit.Value); err == nil {
			return s
		}
	}
	return exprSource(e)
}

// exprSource is an expression as CUE writes it, on one line.
func exprSource(e ast.Expr) string {
	b, err := format.Node(e)
	if err != nil {
		return ""
	}
	return strings.Join(strings.Fields(string(b)), " ")
}

// fieldDoc is a field's doc comment, the text after +usage= where it has one.
func fieldDoc(f *ast.Field) string {
	var lines []string
	for _, cg := range ast.Comments(f) {
		if !cg.Doc {
			continue
		}
		for _, c := range cg.List {
			line := strings.TrimSpace(strings.TrimPrefix(c.Text, "//"))
			if i := strings.Index(line, "+usage="); i >= 0 {
				return strings.TrimSpace(line[i+len("+usage="):])
			}
			if strings.HasPrefix(line, "+") {
				continue
			}
			lines = append(lines, line)
		}
	}
	return strings.TrimSpace(strings.Join(lines, " "))
}
