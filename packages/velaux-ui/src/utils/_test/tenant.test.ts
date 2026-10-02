import { expect } from 'chai';

import { allTenants, inTenant, resolveTenant, tenantChanged } from '../tenant';

describe('resolveTenant', () => {
  it('keeps a tenant the user may open', () => {
    expect(resolveTenant('shop', ['default', 'shop'], false)).to.equal('shop');
  });
  it('falls back to all tenants for those who may see them', () => {
    expect(resolveTenant('gone', ['default', 'shop'], true)).to.equal(allTenants);
    expect(resolveTenant(undefined, ['default'], true)).to.equal(allTenants);
  });
  it('falls back to the first tenant for everyone else', () => {
    expect(resolveTenant('gone', ['default', 'shop'], false)).to.equal('default');
    expect(resolveTenant(allTenants, ['shop'], false)).to.equal('shop');
  });
});

describe('inTenant', () => {
  it('keeps what belongs to the tenant, or everything for all tenants', () => {
    expect(inTenant('shop', 'shop')).to.equal(true);
    expect(inTenant('shop', 'default')).to.equal(false);
    expect(inTenant(allTenants, 'default')).to.equal(true);
  });
});

describe('tenantChanged', () => {
  it('loads again when the tenant becomes known or another is picked', () => {
    expect(tenantChanged({ current: '', resolved: false }, { current: '', resolved: true })).to.equal(true);
    expect(tenantChanged({ current: 'shop', resolved: true }, { current: 'default', resolved: true })).to.equal(true);
    expect(tenantChanged({ current: 'shop', resolved: true }, { current: 'shop', resolved: true })).to.equal(false);
    expect(tenantChanged({ current: '', resolved: false }, { current: '', resolved: false })).to.equal(false);
  });
});
