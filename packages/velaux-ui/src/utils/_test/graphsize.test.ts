import { expect } from 'chai';

import { flowPath, getGraphSize, innerPoints, shiftIntoView, sideRoute } from '../../components/TreeGraph/layout';

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

describe('innerPoints', () => {
  it('drops the one midpoint a route between neighbouring columns has', () => {
    expect(
      innerPoints([
        { x: 50, y: 40 },
        { x: 200, y: 120 },
        { x: 350, y: 200 },
      ])
    ).to.deep.equal([]);
  });
  it('keeps the inner points of a route long enough to pass other columns', () => {
    expect(
      innerPoints([
        { x: 50, y: 20 },
        { x: 150, y: 100 },
        { x: 250, y: 100 },
        { x: 350, y: 230 },
      ])
    ).to.deep.equal([
      { x: 150, y: 100 },
      { x: 250, y: 100 },
    ]);
  });
});

describe('sideRoute', () => {
  it("runs from the source's right middle, through the inner points, to the target's left middle", () => {
    expect(
      sideRoute({ left: 0, top: 0, width: 100, height: 40 }, { left: 300, top: 200, width: 100, height: 60 }, [
        { x: 200, y: 100 },
      ])
    ).to.deep.equal([
      { x: 100, y: 20 },
      { x: 200, y: 100 },
      { x: 300, y: 230 },
    ]);
  });
});

describe('flowPath', () => {
  it('curves between two points, level where it leaves and where it arrives', () => {
    expect(
      flowPath([
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ])
    ).to.equal('M 0 0 C 50 0 50 50 100 50');
  });
  it('curves through each inner point in turn', () => {
    expect(
      flowPath([
        { x: 0, y: 0 },
        { x: 100, y: 50 },
        { x: 300, y: 50 },
      ])
    ).to.equal('M 0 0 C 50 0 50 50 100 50 C 200 50 200 50 300 50');
  });
  it('draws nothing for fewer than two points', () => {
    expect(flowPath([])).to.equal('');
  });
});
