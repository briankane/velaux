import { expect } from 'chai';

import { resourceOrigin } from '../../pages/ApplicationStatus/components/ApplicationGraph/origins';

describe('resourceOrigin', () => {
  const components: any[] = [
    { name: 'payments-api', componentType: 'webapp@v1.1.0' },
    { name: 'payments-receipts', componentType: 'aws-s3' },
  ];
  it("names the component that applied a resource, and that component's type", () => {
    expect(resourceOrigin({ name: 'web', component: 'payments-receipts', latest: true }, components)).to.deep.equal({
      component: 'payments-receipts',
      type: 'aws-s3',
    });
  });
  it('names the trait that applied it, where a trait did', () => {
    expect(
      resourceOrigin({ name: 'hpa', component: 'payments-api', trait: 'cpuscaler', latest: true }, components)
    ).to.deep.equal({ component: 'payments-api', type: 'webapp@v1.1.0', trait: 'cpuscaler' });
  });
  it("counts a resource the component's own template outputs as the component's, not a trait's", () => {
    expect(
      resourceOrigin({ name: 'svc', component: 'payments-api', trait: 'AuxiliaryWorkload', latest: true }, components)
    ).to.deep.equal({ component: 'payments-api', type: 'webapp@v1.1.0' });
  });
  it('leaves the type out for a component the application no longer lists', () => {
    expect(resourceOrigin({ name: 'old', component: 'gone', latest: true }, components)).to.deep.equal({
      component: 'gone',
    });
  });
  it('has no origin for a resource no component applied', () => {
    expect(resourceOrigin({ name: 'x', component: '', latest: true }, components)).to.equal(undefined);
  });
});
