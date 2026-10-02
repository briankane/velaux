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
