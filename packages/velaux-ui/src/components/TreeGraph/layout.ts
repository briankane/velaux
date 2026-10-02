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
