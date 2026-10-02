import { expect } from 'chai';

import { addLink, wantsAdd } from '../../layout/Application/components/AppTabs/add';

describe('configure tabs', () => {
  it('asks a tab for its add dialog through the URL', () => {
    expect(addLink('/applications/shop/config/components')).to.equal('/applications/shop/config/components?add=1');
    expect(wantsAdd('?add=1')).to.equal(true);
    expect(wantsAdd('?x=y&add=1')).to.equal(true);
    expect(wantsAdd('')).to.equal(false);
    expect(wantsAdd(undefined)).to.equal(false);
    expect(wantsAdd('?add=0')).to.equal(false);
  });
});
