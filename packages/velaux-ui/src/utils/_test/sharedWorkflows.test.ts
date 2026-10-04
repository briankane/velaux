import { expect } from 'chai';

import type { SharedWorkflow } from '@velaux/data';
import { usableShared } from '../sharedWorkflows';

const shared = (scope: SharedWorkflow['scope'], hidden?: boolean): SharedWorkflow => ({
  name: 'release',
  namespace: scope === 'global' ? 'vela-system' : 'shop',
  scope,
  hidden,
  steps: [],
});

describe('shared workflows an environment can run', () => {
  it('runs the project and global ones in the project namespace', () => {
    expect(usableShared(shared('project'))).to.equal(true);
    expect(usableShared(shared('global'))).to.equal(true);
  });

  it('does not run a global one hidden by the project one of its name', () => {
    expect(usableShared(shared('global', true))).to.equal(false);
  });

  it('runs only global ones outside the project namespace', () => {
    expect(usableShared(shared('project'), true)).to.equal(false);
    expect(usableShared(shared('global'), true)).to.equal(true);
  });
});
