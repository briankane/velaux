import { expect } from 'chai';

import { addLink, tabsReadOnly, wantsAdd } from '../../layout/Application/components/AppTabs/add';

describe('configure tabs', () => {
  it('asks a tab for its add dialog through the URL', () => {
    expect(addLink('/applications/shop/config/components')).to.equal('/applications/shop/config/components?add=1');
    expect(wantsAdd('?add=1')).to.equal(true);
    expect(wantsAdd('?x=y&add=1')).to.equal(true);
    expect(wantsAdd('')).to.equal(false);
    expect(wantsAdd(undefined)).to.equal(false);
    expect(wantsAdd('?add=0')).to.equal(false);
  });

  it('offers no + on a read-only application, or before its details load', () => {
    expect(tabsReadOnly({ name: 'shop', readOnly: false }, 'shop')).to.equal(false);
    expect(tabsReadOnly({ name: 'addon-fluxcd', readOnly: true }, 'addon-fluxcd')).to.equal(true);
    expect(tabsReadOnly(undefined, 'shop')).to.equal(true);
    expect(tabsReadOnly({ name: 'other', readOnly: false }, 'shop')).to.equal(true, "another application's details");
  });
});
