import { expect } from 'chai';

import { resourceTooltip } from '../../components/TreeGraph/tooltip';

describe('resourceTooltip', () => {
  const resource = { name: 'storefront-web', kind: 'HorizontalPodAutoscaler', namespace: 'shop-prod' };
  const entry = (props: ReturnType<typeof resourceTooltip>, key: string) =>
    props.summary?.find((e) => e.key === key)?.value;

  it('names the component that deployed a resource, its type and revision', () => {
    const props = resourceTooltip(resource, {
      component: 'storefront-web',
      type: 'webapp@v1.1.0',
      componentRevision: 'latest (1.1.0 / v5)',
    });
    expect(entry(props, 'Component')).to.equal('storefront-web');
    expect(entry(props, 'Type')).to.equal('webapp');
    expect(entry(props, 'Revision')).to.equal('latest (1.1.0 / v5)');
    expect(entry(props, 'Trait')).to.equal(undefined);
  });

  it('names the trait that deployed it, and its revision', () => {
    const props = resourceTooltip(resource, {
      component: 'storefront-web',
      type: 'webapp',
      componentRevision: 'latest (1.1.0 / v5)',
      trait: 'cpuscaler',
      traitRevision: 'latest (v3)',
    });
    expect(entry(props, 'Trait')).to.equal('cpuscaler');
    expect(entry(props, 'Trait Revision')).to.equal('latest (v3)');
  });

  it('says nothing of a deployer for a resource no component applied', () => {
    expect(entry(resourceTooltip(resource), 'Component')).to.equal(undefined);
  });
});
