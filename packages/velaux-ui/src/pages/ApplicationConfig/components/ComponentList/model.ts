import type { AppHealth } from '@velaux/data';

import type { DependencyItem } from '../../../../utils/dependencies';

// ComponentStatusIn is an env's status, as far as a component's health needs.
export interface ComponentStatusIn {
  envName: string;
  status?: {
    services?: Array<{ name: string; healthy?: boolean; message?: string; cluster?: string; namespace?: string }>;
  };
}

// ComponentOrbitHealth is a component's health in one env.
export interface ComponentOrbitHealth {
  env: string;
  health: AppHealth;
  message?: string;
}

// componentHealth is a component's health in each env it is deployed to: healthy
// where every placement of it is, unhealthy where any is not. An env where it
// is not placed is left out.
export function componentHealth(component: string, statuses: ComponentStatusIn[]): ComponentOrbitHealth[] {
  const result: ComponentOrbitHealth[] = [];
  (statuses || []).forEach(({ envName, status }) => {
    const placed = (status?.services || []).filter((s) => s.name === component);
    if (placed.length === 0) {
      return;
    }
    const unhealthy = placed.find((s) => !s.healthy);
    result.push({
      env: envName,
      health: unhealthy ? 'unhealthy' : 'healthy',
      message: unhealthy?.message || placed.find((s) => s.message)?.message,
    });
  });
  return result;
}

// PropertyRow is one property as the expanded row lists it.
export interface PropertyRow {
  key: string;
  value: string;
}

// flattenProperties lists a component's properties by dotted path, values
// written as they would be read; a list of scalars stays one value and a list
// of objects is summarised by its length.
export function flattenProperties(properties: unknown, prefix = ''): PropertyRow[] {
  if (properties === null || properties === undefined) {
    return [];
  }
  if (typeof properties !== 'object') {
    return [{ key: prefix, value: String(properties) }];
  }
  if (Array.isArray(properties)) {
    if (properties.every((v) => v === null || typeof v !== 'object')) {
      return [{ key: prefix, value: properties.join(', ') }];
    }
    return [{ key: prefix, value: `${properties.length} item${properties.length === 1 ? '' : 's'}` }];
  }
  const rows: PropertyRow[] = [];
  Object.keys(properties as Record<string, unknown>).forEach((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    rows.push(...flattenProperties((properties as Record<string, unknown>)[key], path));
  });
  return rows;
}

// componentDependsOn is what a component depends on: those written in its
// dependsOn or inputs, then those KubeVela inferred from its expressions. A
// component written and inferred at the same placement is listed once, as
// written; a read of it at another placement is listed beside it.
export function componentDependsOn(written: string[] | undefined, items: DependencyItem[]): DependencyItem[] {
  const result: DependencyItem[] = (written || []).map((name) => ({ name, direction: 'outbound' }));
  items
    .filter((d) => d.direction === 'outbound')
    .forEach((d) => {
      const listed = result.find((r) => r.name === d.name && r.where === d.where);
      if (!listed) {
        result.push(d);
      }
    });
  return result;
}

// DependsOnOption is a component offered for another's dependsOn.
export interface DependsOnOption {
  label: string;
  value: string;
  // inferred is set where the component is read already, through an expression.
  inferred?: string;
}

// dependsOnOptions are the components one may depend on: all others except
// those that already depend on it, written or inferred, which would close a
// cycle. One it already reads is marked, as writing it only makes the order
// explicit.
export function dependsOnOptions(
  components: Array<{ name: string; alias?: string; dependsOn?: string[] }>,
  componentName: string | undefined,
  items: DependencyItem[]
): DependsOnOption[] {
  const inbound = new Set(items.filter((d) => d.direction === 'inbound').map((d) => d.name));
  const reads = items.filter((d) => d.direction === 'outbound' && d.inferred && !d.where);
  return components
    .filter(
      (c) =>
        !componentName || (c.name !== componentName && !c.dependsOn?.includes(componentName) && !inbound.has(c.name))
    )
    .map((c) => {
      const option: DependsOnOption = { label: c.alias ? `${c.alias}(${c.name})` : c.name, value: c.name };
      const read = reads.find((d) => d.name === c.name);
      return read ? { ...option, inferred: read.inferred } : option;
    });
}
