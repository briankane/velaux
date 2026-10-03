import React, { useEffect, useState } from 'react';

import { listDefinitionRevisions } from '../../api/definitions';
import type { DefinitionRevision } from '../../utils/definitionVersion';
import { inUseLabel, splitType } from '../../utils/definitionVersion';

// revisionsFor loads a definition's revisions once a minute at most, shared by
// every node of that type on the page.
const loaded = new Map<string, { at: number; revisions: Promise<DefinitionRevision[]> }>();
const fresh = 60 * 1000;

function revisionsFor(kind: string, name: string): Promise<DefinitionRevision[]> {
  const key = `${kind}/${name}`;
  const hit = loaded.get(key);
  if (hit && Date.now() - hit.at < fresh) {
    return hit.revisions;
  }
  const revisions = listDefinitionRevisions({ name, type: kind })
    .then((res: any) => (res?.revisions || []) as DefinitionRevision[])
    .catch(() => []);
  loaded.set(key, { at: Date.now(), revisions });
  return revisions;
}

// DefinitionLine is the definition a node is an instance of, and under it the
// revision its type resolves to: the latest, or the version it is pinned to.
export const DefinitionLine = (props: { kind: 'component' | 'source'; type?: string }) => {
  const { name, version } = splitType(props.type);
  const [revisions, setRevisions] = useState<DefinitionRevision[] | undefined>();
  useEffect(() => {
    let live = true;
    if (name) {
      revisionsFor(props.kind, name).then((list) => live && setRevisions(list));
    }
    return () => {
      live = false;
    };
  }, [props.kind, name]);
  if (!name) {
    return null;
  }
  return (
    <div className="definition-line">
      <span className="definition-name">{name}</span>
      <span className="definition-version">{revisions ? inUseLabel(version, revisions) : version || 'latest'}</span>
    </div>
  );
};
