// A type pinned to one version of its definition is written name@version, as
// KubeVela resolves it: webapp@v2, or webapp@v1.2.0 where spec.version names it.

// splitType is a type's definition name and the version it is pinned to, or
// no version for one that follows the latest.
export function splitType(type?: string): { name: string; version?: string } {
  if (!type) {
    return { name: '' };
  }
  const at = type.indexOf('@');
  if (at < 0) {
    return { name: type };
  }
  return { name: type.slice(0, at), version: type.slice(at + 1) || undefined };
}

// joinType is the type for a definition at a version; no version follows the latest.
export function joinType(name: string, version?: string): string {
  return version ? `${name}@${version}` : name;
}

// DefinitionRevision is one revision of a definition, as the server lists it.
export interface DefinitionRevision {
  revision: number;
  version: string;
  hash: string;
  createTime: string;
}

// versionLabel names a revision for a person: a named version with its
// revision number, or the number alone.
export function versionLabel(r: DefinitionRevision): string {
  return r.version === `v${r.revision}` ? r.version : `${r.version.replace(/^v/, '')} (v${r.revision})`;
}
