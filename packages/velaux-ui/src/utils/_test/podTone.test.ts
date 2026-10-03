import { expect } from 'chai';

import { podTone } from '../../components/TreeGraph/pods';

describe('podTone', () => {
  it('follows the health status where there is one', () => {
    expect(podTone('2/2', 'UnHealthy')).to.equal('unhealthy');
    expect(podTone('2/2', 'Progressing')).to.equal('progressing');
    expect(podTone('1/2', 'Healthy')).to.equal('healthy');
  });
  it('is healthy with every container ready, and progressing with some not', () => {
    expect(podTone('2/2')).to.equal('healthy');
    expect(podTone('1/2')).to.equal('progressing');
    expect(podTone('0/1')).to.equal('progressing');
  });
  it('is neutral with no ready count', () => {
    expect(podTone(undefined)).to.equal('neutral');
  });
});
