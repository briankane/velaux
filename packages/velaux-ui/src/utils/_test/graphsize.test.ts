import { expect } from 'chai';

import { edgePath, getGraphSize, joinThrough, shiftIntoView, sideRoute } from '../../components/TreeGraph/layout';

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
    expect(
      edgePath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ])
    ).to.equal('M 0 0 L 100 0');
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

describe('joinThrough', () => {
  it('runs from the first route through the centre into the second, dropping the ends at the box between', () => {
    expect(
      joinThrough(
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 90, y: 50 },
        ],
        { x: 100, y: 50 },
        [
          { x: 110, y: 50 },
          { x: 200, y: 50 },
        ]
      )
    ).to.deep.equal([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 100, y: 50 },
      { x: 200, y: 50 },
    ]);
  });
});

describe('sideRoute', () => {
  const source = { left: 0, top: 0, width: 100, height: 40 };
  const target = { left: 300, top: 200, width: 100, height: 60 };
  it("leaves the source's right side and enters the target's left side, at their middles", () => {
    expect(
      sideRoute(
        [
          { x: 50, y: 40 },
          { x: 200, y: 120 },
          { x: 350, y: 200 },
        ],
        source,
        target,
        12
      )
    ).to.deep.equal([
      { x: 100, y: 20 },
      { x: 112, y: 20 },
      { x: 200, y: 120 },
      { x: 288, y: 230 },
      { x: 300, y: 230 },
    ]);
  });
  it('keeps every inner point of a long route', () => {
    const route = sideRoute(
      [
        { x: 50, y: 20 },
        { x: 150, y: 100 },
        { x: 250, y: 100 },
        { x: 350, y: 230 },
      ],
      source,
      target,
      12
    );
    expect(route.slice(2, 4)).to.deep.equal([
      { x: 150, y: 100 },
      { x: 250, y: 100 },
    ]);
  });
});
