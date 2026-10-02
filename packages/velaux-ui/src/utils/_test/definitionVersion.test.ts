import { expect } from 'chai';

import { joinType, splitType, versionLabel } from '../definitionVersion';

describe('definition versions', () => {
  it('splits a pinned type and joins it back', () => {
    expect(splitType('webapp@v2')).to.deep.equal({ name: 'webapp', version: 'v2' });
    expect(splitType('webapp@v1.2.0')).to.deep.equal({ name: 'webapp', version: 'v1.2.0' });
    expect(splitType('webapp')).to.deep.equal({ name: 'webapp' });
    expect(splitType(undefined)).to.deep.equal({ name: '' });
    expect(joinType('webapp', 'v2')).to.equal('webapp@v2');
    expect(joinType('webapp', undefined)).to.equal('webapp');
  });
  it('names a revision by its version, with the number where the version is named', () => {
    expect(versionLabel({ revision: 2, version: 'v2', hash: '', createTime: '' })).to.equal('v2');
    expect(versionLabel({ revision: 3, version: 'v1.2.0', hash: '', createTime: '' })).to.equal('1.2.0 (v3)');
  });
});
