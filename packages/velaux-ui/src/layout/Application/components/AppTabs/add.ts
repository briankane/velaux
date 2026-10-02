// addQuery asks a configure tab to open its add dialog once it loads.
export const addQuery = 'add=1';

// addLink is a configure tab's path with its add dialog asked for.
export function addLink(to: string): string {
  return `${to}?${addQuery}`;
}

// wantsAdd reports whether a page's query asks for its add dialog.
export function wantsAdd(search?: string): boolean {
  return new URLSearchParams(search || '').get('add') === '1';
}

// tabsReadOnly reports whether an application's tabs offer no +: when it is
// read-only, and until its own details have loaded.
export function tabsReadOnly(detail: { name?: string; readOnly?: boolean } | undefined, appName: string): boolean {
  if (!detail || detail.name !== appName) {
    return true;
  }
  return !!detail.readOnly;
}

// tabRuns splits tabs into runs of neighbours that share a group, or none.
export function tabRuns<T extends { group?: string }>(tabs: T[]): Array<{ group?: string; tabs: T[] }> {
  const runs: Array<{ group?: string; tabs: T[] }> = [];
  tabs.forEach((t) => {
    const last = runs[runs.length - 1];
    if (last && last.group === t.group) {
      last.tabs.push(t);
    } else {
      runs.push({ group: t.group, tabs: [t] });
    }
  });
  return runs;
}
