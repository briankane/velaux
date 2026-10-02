import { expect } from 'chai';

import { getGraphSize } from '../../components/TreeGraph/layout';

describe('graph size', () => {
  it('reaches the right and bottom edges of the furthest nodes', () => {
    expect(
      getGraphSize([
        { x: 100, y: 50, width: 300, height: 40 },
        { x: 600, y: 20, width: 220, height: 40 },
      ])
    ).to.deep.equal({ width: 820, height: 90 });
  });
});
