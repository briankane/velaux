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

// rectBoundary is where a line from a point toward a box's centre crosses into
// the box: where an edge from that point meets the node. A point already
// inside is left where it is.
export function rectBoundary(from: { x: number; y: number }, rect: Rect): { x: number; y: number } {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = cx - from.x;
  const dy = cy - from.y;
  const inside =
    from.x >= rect.left && from.x <= rect.left + rect.width && from.y >= rect.top && from.y <= rect.top + rect.height;
  if (inside || (dx === 0 && dy === 0)) {
    return from;
  }
  // The line enters the box at the latest of the times it crosses into each
  // pair of opposite sides.
  const enter = (start: number, delta: number, low: number, high: number) => {
    if (delta === 0) {
      return -Infinity;
    }
    const t1 = (low - start) / delta;
    const t2 = (high - start) / delta;
    return Math.min(t1, t2);
  };
  const t = Math.max(
    enter(from.x, dx, rect.left, rect.left + rect.width),
    enter(from.y, dy, rect.top, rect.top + rect.height)
  );
  return { x: from.x + dx * t, y: from.y + dy * t };
}
