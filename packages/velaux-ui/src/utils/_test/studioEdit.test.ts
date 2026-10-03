import { expect } from 'chai';

import { insertAfter } from '../../components/WorkflowStudio/edit';

type S = { name: string; type: string; dependsOn?: string[]; inputs?: Array<{ from: string; parameterKey: string }> };

const steps: S[] = [
  { name: 'deploy', type: 'deploy' },
  { name: 'migrate', type: 'suspend', dependsOn: ['deploy'] },
  { name: 'canary', type: 'suspend', dependsOn: ['migrate'] },
  { name: 'notify', type: 'suspend', dependsOn: ['migrate', 'deploy'] },
  { name: 'reads', type: 'suspend', inputs: [{ from: 'migrated', parameterKey: 'x' }] },
];
const added: S = { name: 'backup', type: 'suspend' };

describe('insertAfter', () => {
  it("puts the step in the middle in parallel: it waits on the anchor, and the anchor's dependants wait on it", () => {
    const out = insertAfter(steps, 'migrate', added, { mode: 'DAG', branch: false });
    expect(out.map((s) => s.name)).to.deep.equal(['deploy', 'migrate', 'backup', 'canary', 'notify', 'reads']);
    expect(out.find((s) => s.name === 'backup')?.dependsOn).to.deep.equal(['migrate']);
    expect(out.find((s) => s.name === 'canary')?.dependsOn).to.deep.equal(['backup']);
    expect(out.find((s) => s.name === 'notify')?.dependsOn).to.deep.equal(['backup', 'deploy']);
  });
  it('adds a branch that nothing waits on', () => {
    const out = insertAfter(steps, 'migrate', added, { mode: 'DAG', branch: true });
    expect(out.find((s) => s.name === 'backup')?.dependsOn).to.deep.equal(['migrate']);
    expect(out.find((s) => s.name === 'canary')?.dependsOn).to.deep.equal(['migrate']);
  });
  it('places the step straight after the anchor in order, adding no dependsOn of its own', () => {
    const out = insertAfter(steps, 'deploy', added, { mode: 'StepByStep', branch: false });
    expect(out.map((s) => s.name).slice(0, 3)).to.deep.equal(['deploy', 'backup', 'migrate']);
    expect(out.find((s) => s.name === 'backup')?.dependsOn).to.equal(undefined);
    expect(out.find((s) => s.name === 'migrate')?.dependsOn).to.deep.equal(['backup']);
  });
  it('leaves a step that waits only through its inputs alone', () => {
    const out = insertAfter(steps, 'migrate', added, { mode: 'DAG', branch: false });
    expect(out.find((s) => s.name === 'reads')).to.deep.equal(steps[4]);
  });
  it('appends with no dependencies when there is no anchor', () => {
    const out = insertAfter(steps, undefined, added, { mode: 'DAG', branch: false });
    expect(out[out.length - 1]).to.deep.equal(added);
  });
});
