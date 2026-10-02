import { expect } from 'chai';

import { recordStatus } from '../../pages/ApplicationWorkflowStatus/components/WorkflowRecord/status';

describe('recordStatus', () => {
  it('gives each phase a badge tone and label', () => {
    expect(recordStatus('succeeded')).to.deep.equal({ tone: 'healthy', label: 'Succeeded' });
    expect(recordStatus('terminated').tone).to.equal('failed');
    expect(recordStatus('suspending').tone).to.equal('suspended');
    expect(recordStatus('executing').tone).to.equal('progressing');
    expect(recordStatus('somethingNew')).to.deep.equal({ tone: 'neutral', label: 'SomethingNew' });
    expect(recordStatus(undefined).label).to.equal('Unknown');
  });
});
