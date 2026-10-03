import type { AppliedResource, ApplicationComponent } from '@velaux/data';

import type { ResourceOrigin } from '../../../../components/TreeGraph/interface';

// resourceOrigin is the component that applied a resource, with its type, and
// the trait that did where a trait did; none where no component is recorded.
export function resourceOrigin(
  res: AppliedResource,
  components: ApplicationComponent[] = []
): ResourceOrigin | undefined {
  if (!res.component) {
    return undefined;
  }
  const type = components.find((c) => c.name === res.component)?.componentType;
  return { component: res.component, ...(type ? { type } : {}), ...(res.trait ? { trait: res.trait } : {}) };
}
