import { expect } from 'chai';

import { edgePath, getGraphSize, shiftIntoView } from '../../components/TreeGraph/layout';

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

describe('shiftIntoView', () => {
  it('moves a layout routed above or left of the origin back into view', () => {
    const nodes = [
      { x: 10, y: 37, width: 100, height: 40 },
      { x: 300, y: 37, width: 100, height: 40 },
    ];
    // A long edge dagre routed through a lane above the first row.
    const points = [
      { x: 60, y: 10 },
      { x: 200, y: -50 },
      { x: 350, y: 10 },
    ];
    shiftIntoView(nodes, [points], 20);
    expect(Math.min(...points.map((p) => p.y))).to.equal(20);
    expect(nodes.map((n) => n.y)).to.deep.equal([107, 107]);
    expect(nodes.map((n) => n.x)).to.deep.equal([10, 300]);
  });
  it('leaves a layout already in view alone', () => {
    const nodes = [{ x: 10, y: 37, width: 100, height: 40 }];
    const points = [{ x: 60, y: 37 }];
    shiftIntoView(nodes, [points], 20);
    expect(nodes[0]).to.deep.equal({ x: 10, y: 37, width: 100, height: 40 });
    expect(points[0]).to.deep.equal({ x: 60, y: 37 });
  });
});

describe('edgePath', () => {
  it('runs straight between two points', () => {
    expect(edgePath([{ x: 0, y: 0 }, { x: 100, y: 0 }])).to.equal('M 0 0 L 100 0');
  });
  it('rounds each bend through its midpoints, ending on the last point', () => {
    expect(
      edgePath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ])
    ).to.equal('M 0 0 L 50 0 Q 100 0 100 50 L 100 100');
  });
  it('draws nothing for fewer than two points', () => {
    expect(edgePath([{ x: 1, y: 1 }])).to.equal('');
    expect(edgePath([])).to.equal('');
  });
});
