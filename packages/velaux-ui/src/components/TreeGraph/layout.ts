import type { Node } from './interface';

// getGraphSize is the extent of a laid-out graph: the furthest right and lowest
// any node reaches. A node is drawn from its x and y, so it reaches x + width.
export function getGraphSize(nodes: Node[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  nodes.forEach((node) => {
    width = Math.max((node.x || 0) + node.width, width);
    height = Math.max((node.y || 0) + node.height, height);
  });
  return { width, height };
}

// shiftIntoView moves a laid-out graph, nodes and edge points together, when
// any of it lies above or left of the origin, until that part is margin in. dagre routes an edge that
// spans several ranks through a lane of its own, which can lie above the first
// row of nodes, where the canvas would clip it.
export function shiftIntoView(
  nodes: Array<{ x?: number; y?: number }>,
  edges: Array<Array<{ x: number; y: number }>>,
  margin: number
) {
  let minX = Infinity;
  let minY = Infinity;
  nodes.forEach((n) => {
    minX = Math.min(minX, n.x || 0);
    minY = Math.min(minY, n.y || 0);
  });
  edges.forEach((points) =>
    points.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    })
  );
  const dx = minX < 0 ? margin - minX : 0;
  const dy = minY < 0 ? margin - minY : 0;
  if (dx === 0 && dy === 0) {
    return;
  }
  nodes.forEach((n) => {
    n.x = (n.x || 0) + dx;
    n.y = (n.y || 0) + dy;
  });
  edges.forEach((points) =>
    points.forEach((p) => {
      p.x += dx;
      p.y += dy;
    })
  );
}

// edgePath is an SVG path through an edge's points, its bends rounded: each
// inner point is a curve's control, from the middle of the segment before it
// to the middle of the one after, so the path still ends on the last point.
export function edgePath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) {
    return '';
  }
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const before = mid(points[i - 1], points[i]);
    const after = mid(points[i], points[i + 1]);
    parts.push(`L ${before.x} ${before.y}`, `Q ${points[i].x} ${points[i].y} ${after.x} ${after.y}`);
  }
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}

// Rect is a node's box as drawn: its top-left corner and size.
export type Rect = { left: number; top: number; width: number; height: number };

// joinThrough is one route made of two that meet at a box: the first without
// its last point and the second without its first, joined at the box's centre.
export function joinThrough(
  into: Array<{ x: number; y: number }>,
  centre: { x: number; y: number },
  out: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  return [...into.slice(0, -1), centre, ...out.slice(1)];
}

// sideRoute is an edge's route between two boxes laid out left to right: out
// of the middle of the source's right side, into the middle of the target's
// left side, each with a short straight lead, and the layout's inner points
// between.
export function sideRoute(
  points: Array<{ x: number; y: number }>,
  source: Rect,
  target: Rect,
  lead: number
): Array<{ x: number; y: number }> {
  const out = { x: source.left + source.width, y: source.top + source.height / 2 };
  const into = { x: target.left, y: target.top + target.height / 2 };
  return [out, { x: out.x + lead, y: out.y }, ...points.slice(1, -1), { x: into.x - lead, y: into.y }, into];
}

// edgeOffset is where the graph draws the layout's origin: room for the app
// node's badge above and to the left.
export const edgeOffset = { x: 40, y: 30 };

// placeAt is where a node is drawn: the box the layout gave it, centred on its
// point, so the layout's routes clear it. A box that grows keeps its top, its
// height a floor.
export function placeAt(
  node: { x: number; y: number; width: number; height: number },
  grow?: boolean
): { left: number; top: number; width: number; height?: number; minHeight?: number; margin: number } {
  const box = {
    left: node.x + edgeOffset.x - node.width / 2,
    top: node.y + edgeOffset.y - node.height / 2,
    width: node.width,
    margin: 0,
  };
  return grow ? { ...box, minHeight: node.height } : { ...box, height: node.height };
}
