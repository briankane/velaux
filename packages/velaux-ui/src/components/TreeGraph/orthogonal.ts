// Orthogonal edge routing for a graph laid out in columns, left to right. An
// edge leaves its source's right side and enters its target's left side, turns
// only at right angles, and runs vertically only in a lane of its own in the
// gap between two columns, so no two edges overlap. Ports are spread along a
// side in the order their edges head; a side too short for its edges spills
// the rest onto the box's top and bottom, beside that corner.

export type Point = { x: number; y: number };
export type Box = { left: number; top: number; width: number; height: number };

// RouteNode is a box to route between, and the column it is laid out in.
export interface RouteNode {
  key: string;
  box: Box;
  column: number;
}

// RouteEdge joins two nodes; passes are the heights it crosses each column
// between them at, which the layout kept clear for it.
export interface RouteEdge {
  key: string;
  from: string;
  to: string;
  passes?: number[];
}

export interface RouteOptions {
  // spacing is the least distance between two ports or two lanes.
  spacing: number;
  // leadOut and leadIn are the shortest runs out of a port and into one, the
  // second long enough to hold an arrowhead.
  leadOut: number;
  leadIn: number;
  // stub is how far above or below a box a spilled port's edge turns.
  stub: number;
}

export const routeDefaults: RouteOptions = { spacing: 8, leadOut: 10, leadIn: 18, stub: 10 };

// Port is where an edge meets a box: the points from the box's side to where
// the edge runs level, and that height.
interface Port {
  points: Point[];
  level: number;
}

const centreY = (b: Box) => b.top + b.height / 2;

// sidePorts places the ports for edges heading toward the given heights, on a
// box's right side (out) or left side (in), spilling onto the top and bottom.
// Each list of points runs from the box outward.
function sidePorts(b: Box, toward: number[], out: boolean, o: RouteOptions): Port[] {
  const n = toward.length;
  const order = toward.map((y, i) => i).sort((i, j) => toward[i] - toward[j] || i - j);
  const capacity = Math.max(1, Math.floor((b.height - o.spacing) / o.spacing));
  const extra = Math.max(0, n - capacity);
  const above = Math.ceil(extra / 2);
  const below = extra - above;
  const sideX = out ? b.left + b.width : b.left;
  // inward steps from the side's corner along the top or bottom edge
  const along = (k: number) => (out ? sideX - o.spacing * k : sideX + o.spacing * k);
  const ports: Port[] = new Array(n);
  const onSide = order.slice(above, n - below);
  onSide.forEach((i, k) => {
    const y = b.top + (b.height * (k + 1)) / (onSide.length + 1);
    ports[i] = { points: [{ x: sideX, y }], level: y };
  });
  // The highest-heading edge leaves furthest from the corner and turns highest,
  // so the edges spilled over the top nest without crossing; the bottom mirrors.
  order.slice(0, above).forEach((i, k) => {
    const x = along(above - k);
    const level = b.top - o.stub - o.spacing * (above - 1 - k);
    ports[i] = {
      points: [
        { x, y: b.top },
        { x, y: level },
      ],
      level,
    };
  });
  order.slice(n - below).forEach((i, k) => {
    const x = along(k + 1);
    const level = b.top + b.height + o.stub + o.spacing * k;
    ports[i] = {
      points: [
        { x, y: b.top + b.height },
        { x, y: level },
      ],
      level,
    };
  });
  return ports;
}

// simplify drops repeated points and the middle of three in a line.
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  points.forEach((p) => {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) {
      return;
    }
    const before = out[out.length - 2];
    if (before && last && ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))) {
      out[out.length - 1] = p;
      return;
    }
    out.push(p);
  });
  return out;
}

interface Plan {
  edge: RouteEdge;
  first: number;
  last: number;
  levels: number[];
  out: Port;
  into: Port;
}

// columnsOf is each column's left and right bounds: the edges of its widest
// boxes.
function columnsOf(nodes: RouteNode[]): { left: Map<number, number>; right: Map<number, number> } {
  const left = new Map<number, number>();
  const right = new Map<number, number>();
  nodes.forEach(({ box: b, column }) => {
    left.set(column, Math.min(left.get(column) ?? Infinity, b.left));
    right.set(column, Math.max(right.get(column) ?? -Infinity, b.left + b.width));
  });
  return { left, right };
}

// lanesNeeded is the most edges crossing any one gap between columns, which
// is how many lanes that gap must hold.
export function lanesNeeded(nodes: RouteNode[], edges: RouteEdge[]): number {
  const column = new Map(nodes.map((n) => [n.key, n.column]));
  const crossing = new Map<number, number>();
  edges.forEach((e) => {
    const a = column.get(e.from);
    const b = column.get(e.to);
    if (a === undefined || b === undefined) {
      return;
    }
    for (let g = a; g < b; g++) {
      crossing.set(g, (crossing.get(g) || 0) + 1);
    }
  });
  return Math.max(0, ...crossing.values());
}

// routeEdges routes every edge between nodes in increasing columns; an edge
// whose target is not right of its source runs straight between their sides.
export function routeEdges(
  nodes: RouteNode[],
  edges: RouteEdge[],
  o: RouteOptions = routeDefaults
): Record<string, Point[]> {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const routes: Record<string, Point[]> = {};
  const forward = edges.filter((e) => {
    const a = byKey.get(e.from);
    const b = byKey.get(e.to);
    if (!a || !b) {
      return false;
    }
    if (b.column > a.column) {
      return true;
    }
    routes[e.key] = [
      { x: a.box.left + a.box.width, y: centreY(a.box) },
      { x: b.box.left, y: centreY(b.box) },
    ];
    return false;
  });

  // Each edge's passes, one per column it skips: as given, else level with its
  // source.
  const passesOf = (e: RouteEdge): number[] => {
    const skipped = byKey.get(e.to)!.column - byKey.get(e.from)!.column - 1;
    const given = e.passes || [];
    return given.length === skipped ? given : new Array(skipped).fill(centreY(byKey.get(e.from)!.box));
  };

  const outPorts = new Map<string, Port>();
  const inPorts = new Map<string, Port>();
  nodes.forEach((n) => {
    const outs = forward.filter((e) => e.from === n.key);
    const ins = forward.filter((e) => e.to === n.key);
    const heading = outs.map((e) => passesOf(e)[0] ?? centreY(byKey.get(e.to)!.box));
    const coming = ins.map((e) => {
      const passes = passesOf(e);
      return passes[passes.length - 1] ?? centreY(byKey.get(e.from)!.box);
    });
    sidePorts(n.box, heading, true, o).forEach((p, i) => outPorts.set(outs[i].key, p));
    sidePorts(n.box, coming, false, o).forEach((p, i) => inPorts.set(ins[i].key, p));
  });

  const plans: Plan[] = forward.map((edge) => {
    const out = outPorts.get(edge.key)!;
    const into = inPorts.get(edge.key)!;
    return {
      edge,
      first: byKey.get(edge.from)!.column,
      last: byKey.get(edge.to)!.column,
      levels: [out.level, ...passesOf(edge), into.level],
      out,
      into,
    };
  });

  // Lanes, gap by gap. Edges heading down take lanes from the right, the one
  // starting highest rightmost; edges heading up do the same from the lowest.
  // Either way an edge's level runs never cross the lanes of its own kind.
  const { left, right } = columnsOf(nodes);
  const lanes = new Map<string, number>();
  const gaps = new Set<number>();
  plans.forEach((p) => {
    for (let g = p.first; g < p.last; g++) {
      gaps.add(g);
    }
  });
  gaps.forEach((g) => {
    const turning = plans
      .filter((p) => p.first <= g && g < p.last)
      .map((p) => ({ p, from: p.levels[g - p.first], to: p.levels[g - p.first + 1] }))
      .filter(({ from, to }) => from !== to);
    const down = turning.filter((t) => t.to > t.from).sort((a, b) => a.from - b.from);
    const up = turning.filter((t) => t.to < t.from).sort((a, b) => b.from - a.from);
    const rightToLeft = [...down, ...up];
    const lo = (right.get(g) ?? 0) + o.leadOut;
    const hi = (left.get(g + 1) ?? lo) - o.leadIn;
    const count = rightToLeft.length;
    const step = count > 1 ? Math.min(o.spacing * 2, Math.max(1, (hi - lo) / (count - 1))) : 0;
    const start = (lo + hi) / 2 + (step * (count - 1)) / 2;
    rightToLeft.forEach(({ p }, k) => lanes.set(`${p.edge.key}#${g}`, Math.round(start - step * k)));
  });

  plans.forEach((p) => {
    const points: Point[] = [...p.out.points];
    for (let g = p.first; g < p.last; g++) {
      const lane = lanes.get(`${p.edge.key}#${g}`);
      if (lane !== undefined) {
        const i = g - p.first;
        points.push({ x: lane, y: p.levels[i] }, { x: lane, y: p.levels[i + 1] });
      }
    }
    points.push(...[...p.into.points].reverse());
    routes[p.edge.key] = simplify(points);
  });
  return routes;
}

// orthoPath is an SVG path along a right-angled route, each corner rounded by
// at most the given radius.
export function orthoPath(points: Point[], radius: number): string {
  if (points.length < 2) {
    return '';
  }
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, c, b] = [points[i - 1], points[i], points[i + 1]];
    const inLen = Math.abs(c.x - a.x) + Math.abs(c.y - a.y);
    const outLen = Math.abs(b.x - c.x) + Math.abs(b.y - c.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const dirIn = { x: Math.sign(c.x - a.x), y: Math.sign(c.y - a.y) };
    const dirOut = { x: Math.sign(b.x - c.x), y: Math.sign(b.y - c.y) };
    parts.push(
      `L ${c.x - dirIn.x * r} ${c.y - dirIn.y * r}`,
      `Q ${c.x} ${c.y} ${c.x + dirOut.x * r} ${c.y + dirOut.y * r}`
    );
  }
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}
