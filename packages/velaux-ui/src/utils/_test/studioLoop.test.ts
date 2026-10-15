import { expect } from 'chai';

import { forEachProblem, forEachWarning, itemColumns, loopInputs, setLoop } from '../../components/WorkflowStudio/loop-edit';

const steps = [
  { name: 'shared', type: 'apply-component' },
  {
    name: 'rollout',
    type: 'step-group',
    forEach: { items: [{ name: 'east', cluster: 'a' }, { name: 'west', replicas: 2 }] },
    subSteps: [{ name: 'deploy', type: 'deploy' }],
  },
  { name: 'canary', type: 'deploy', forEach: { items: ['east', 'west'] } },
  { name: 'regions', type: 'step-group', subSteps: [{ name: 'plain', type: 'suspend' }] },
];

describe('setLoop', () => {
  it('makes a step repeat, and stops it repeating', () => {
    const looped = setLoop(steps, 'shared', { items: ['a'] });
    expect(looped[0]).to.deep.equal({ name: 'shared', type: 'apply-component', forEach: { items: ['a'] } });
    expect(looped[1]).to.equal(steps[1]);
    expect(setLoop(looped, 'shared', undefined)[0]).to.deep.equal({ name: 'shared', type: 'apply-component' });
  });
});

describe('loopInputs', () => {
  it("offers a group's steps the item, its index and each key of the items", () => {
    expect(loopInputs(steps, 'deploy')).to.deep.equal([
      'each.item',
      'each.index',
      'each.item.name',
      'each.item.cluster',
      'each.item.replicas',
    ]);
  });
  it('offers a looped step the item and index, with no keys for scalar items', () => {
    expect(loopInputs(steps, 'canary')).to.deep.equal(['each.item', 'each.index']);
  });
  it('offers nothing outside a loop', () => {
    expect(loopInputs(steps, 'shared')).to.deep.equal([]);
    expect(loopInputs(steps, 'plain')).to.deep.equal([]);
  });
});

describe('itemColumns', () => {
  it('is every key of object items, in first-seen order', () => {
    expect(itemColumns([{ name: 'east', cluster: 'a' }, { name: 'west', replicas: 2 }])).to.deep.equal([
      'name',
      'cluster',
      'replicas',
    ]);
  });
  it('is empty for a list of plain values', () => {
    expect(itemColumns(['east', 'west'])).to.deep.equal([]);
  });
});

describe('forEachProblem', () => {
  it('passes a list, a variable or a whole expression', () => {
    expect(forEachProblem({ items: ['east'] })).to.equal(undefined);
    expect(forEachProblem({ from: 'regions' })).to.equal(undefined);
    expect(forEachProblem({ items: '$(source.platform.regions)' })).to.equal(undefined);
  });
  it('names what is missing or wrong', () => {
    expect(forEachProblem({ items: [] })).to.equal('Add at least one item');
    expect(forEachProblem({ from: '' })).to.equal('Pick the output the items come from');
    expect(forEachProblem({ items: 'regions' })).to.equal('An expression is written $( ... ), and gives the whole list');
  });
});

describe('forEachWarning', () => {
  it("warns over the controller's default limit, which a cluster can raise", () => {
    expect(forEachWarning({ items: new Array(50).fill('x') })).to.equal(undefined);
    expect(forEachWarning({ items: new Array(51).fill('x') })).to.equal(
      "Over 50 items, the controller's default limit. The run fails unless the cluster raised it"
    );
  });
});
