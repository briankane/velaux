import type { LoginUserInfo } from '@velaux/data';

import { checkPermission } from './permission';

// tenantKey is where the browser remembers the tenant last picked.
export const tenantKey = 'tenant';

// allTenants is the picker's value for every tenant at once, offered to those
// who may list every tenant.
export const allTenants = '';

// seesAllTenants is whether a user may work across every tenant at once.
export function seesAllTenants(userInfo?: LoginUserInfo): boolean {
  return checkPermission({ resource: 'project:*', action: 'list' }, '', userInfo);
}

// resolveTenant is the tenant to work in: the one asked for when the user may
// open it, otherwise every tenant for those who may, otherwise their first.
export function resolveTenant(asked: string | null | undefined, projects: string[], all: boolean): string {
  if (asked && projects.includes(asked)) {
    return asked;
  }
  if (all) {
    return allTenants;
  }
  return projects[0] || allTenants;
}

// inTenant is whether something in a project belongs in the picked tenant's views.
export function inTenant(tenant: string, project?: string): boolean {
  return tenant === allTenants || project === tenant;
}

// tenantChanged is whether a view scoped to the tenant must load again: the
// tenant became known, or another was picked.
export function tenantChanged(
  prev?: { current: string; resolved: boolean },
  next?: { current: string; resolved: boolean }
): boolean {
  return !!next?.resolved && (!prev?.resolved || prev.current !== next.current);
}

// askedTenant is the tenant a link names (?tenant=), else the one last picked
// in this browser, else null.
export function askedTenant(): string | null {
  const fromURL = new URLSearchParams(window.location.search).get('tenant');
  if (fromURL !== null) {
    return fromURL;
  }
  try {
    return localStorage.getItem(tenantKey);
  } catch (e) {
    return null;
  }
}
