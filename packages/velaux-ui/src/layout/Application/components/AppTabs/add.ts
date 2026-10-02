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
