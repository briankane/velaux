// SourceField is a path an application reads from a source, such as
// source.db.endpoint.host, with the type its schema declares.
export type SourceField = {
  path: string;
  type: string;
  description?: string;
};

// sourceFields lists the paths $(source.<name>...) can read, from the OpenAPI
// schema of the source definition's schema block.
export function sourceFields(name: string, schema: any, depth = 3): SourceField[] {
  const fields: SourceField[] = [];
  const walk = (s: any, path: string, level: number) => {
    if (!s || !s.properties || level > depth) {
      return;
    }
    for (const [key, child] of Object.entries<any>(s.properties)) {
      const childPath = `${path}.${key}`;
      fields.push({ path: childPath, type: typeName(child), description: child.description });
      walk(child, childPath, level + 1);
    }
  };
  walk(schema, `source.${name}`, 1);
  return fields;
}

function typeName(s: any): string {
  if (s.type === 'array') {
    return `array<${s.items ? typeName(s.items) : 'any'}>`;
  }
  if (s.type === 'object' && !s.properties && s.additionalProperties) {
    return `map<${typeof s.additionalProperties === 'object' ? typeName(s.additionalProperties) : 'any'}>`;
  }
  return s.type || 'any';
}
