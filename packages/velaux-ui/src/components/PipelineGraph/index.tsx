import * as dagre from 'dagre';
import React from 'react';
import Draggable from 'react-draggable';

import type { WorkflowStepStatus } from '@velaux/data';

import './index.less';
import type { RouteEdge, RouteNode } from '../TreeGraph/orthogonal';
import { lanesNeeded, orthoPath, routeDefaults, routeEdges } from '../TreeGraph/orthogonal';
import { Step } from './components/step';
import type { SpecStep } from './dependencies';
import { groupMode, groupOpensItself, stepEdges } from './dependencies';
import { stepReached } from './status';

type GroupSpec = SpecStep & { mode?: string; subSteps?: SpecStep[] };

type StepGraphProps = {
  name?: string;
  steps?: WorkflowStepStatus[];
  // spec and mode are the workflow the run follows, which its edges come from;
  // subMode is how a group's sub-steps run unless the group names its own.
  spec?: GroupSpec[];
  mode: 'StepByStep' | 'DAG';
  subMode?: 'StepByStep' | 'DAG';
  // selected is the id of the step whose details are open.
  selected?: string;
  // actions are drawn under a step waiting for approval.
  actions?: (step: WorkflowStepStatus) => React.ReactNode;
  onNodeClick: (step: WorkflowStepStatus) => void;
  // onResize tells the graph drawing this one, inside an open group, that it
  // changed size.
  onResize?: () => void;
};

type PipelineGraphProps = StepGraphProps & { zoom: number };

const stepWidth = 270;
const margin = 20;
// cardHeight stands in for a card not yet measured.
const cardHeight = 90;

type LaidStep = { width: number; height: number; x: number; y: number };
type LaidEdge = { points?: Array<{ x: number; y: number }>; weight?: number; minlen?: number };
type Laid = dagre.graphlib.Graph<LaidStep, LaidEdge>;

// graphCount numbers each graph drawn, so its arrowhead's id is its own.
let graphCount = 0;

// StepGraph draws steps left to right by what they wait on: a step sits right
// of every step it depends on, and steps that do not wait on each other share a
// column. An open step group draws its sub-steps the same way, inside it.
const StepGraph = (props: StepGraphProps) => {
  const { steps = [], spec, mode, subMode = 'DAG', name, selected, actions, onNodeClick, onResize } = props;
  const [markerId] = React.useState(() => `pipeline-${++graphCount}`);
  // sizes are the cards as drawn: a waiting step or an open group grows.
  const [sizes, setSizes] = React.useState<Record<string, { width: number; height: number }>>({});
  // opened holds the groups someone opened or closed; the rest follow
  // groupOpensItself.
  const [opened, setOpened] = React.useState<Record<string, boolean>>({});
  const [, setNestedResizes] = React.useState(0);
  const container = React.useRef<HTMLDivElement>(null);
  // Measured after every render, as a card's size follows its step's state; it
  // settles once the sizes stop changing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const measured: Record<string, { width: number; height: number }> = {};
    Array.from(container.current?.children || []).forEach((child) => {
      const el = child as HTMLElement;
      if (el.dataset.stepKey) {
        measured[el.dataset.stepKey] = { width: el.offsetWidth, height: el.offsetHeight };
      }
    });
    if (JSON.stringify(measured) !== JSON.stringify(sizes)) {
      setSizes(measured);
    }
  });

  const edges = stepEdges(steps, spec, mode);
  // A hidden root, lightly tied to every step, pulls each step to the earliest
  // column it can start in: dagre otherwise breaks a tie toward the latest.
  const root = '\u0000root';
  const layOut = (ranksep: number) => {
    const g: Laid = new dagre.graphlib.Graph<LaidStep, LaidEdge>();
    g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep });
    g.setNode(root, { width: 0, height: 0, x: 0, y: 0 });
    steps.forEach((s) => {
      g.setNode(s.name, {
        width: sizes[s.name]?.width || stepWidth,
        height: sizes[s.name]?.height || cardHeight,
        x: 0,
        y: 0,
      });
      g.setEdge(root, s.name, { weight: 1, minlen: 1 });
    });
    edges.forEach((e) => g.setEdge(e.from, e.to, { weight: 100 }));
    dagre.layout(g);
    g.removeNode(root);
    // Everything moves so the first step sits at the margin, edge points with
    // the nodes.
    let minX = Infinity;
    let minY = Infinity;
    g.nodes().forEach((k) => {
      minX = Math.min(minX, g.node(k).x - g.node(k).width / 2);
      minY = Math.min(minY, g.node(k).y - g.node(k).height / 2);
    });
    g.edges().forEach((e) => (g.edge(e).points || []).forEach((p) => (minY = Math.min(minY, p.y))));
    const dx = margin - minX;
    const dy = margin - minY;
    g.nodes().forEach((k) => {
      g.node(k).x += dx;
      g.node(k).y += dy;
    });
    g.edges().forEach((e) =>
      (g.edge(e).points || []).forEach((p) => {
        p.x += dx;
        p.y += dy;
      })
    );
    return g;
  };
  const routing = (g: Laid) => {
    const centres = Array.from(new Set(g.nodes().map((k) => Math.round(g.node(k).x)))).sort((x, y) => x - y);
    const columnOf = (key: string) => centres.indexOf(Math.round(g.node(key).x));
    const nodes: RouteNode[] = g.nodes().map((key) => {
      const n = g.node(key);
      return {
        key,
        column: columnOf(key),
        box: { left: n.x - n.width / 2, top: n.y - n.height / 2, width: n.width, height: n.height },
      };
    });
    const routeEdgeList: RouteEdge[] = g.edges().map((e) => {
      const points = g.edge(e).points || [];
      const passes: number[] = [];
      for (let c = columnOf(e.v) + 1; c < columnOf(e.w); c++) {
        const nearest = points.reduce((best, p) =>
          Math.abs(p.x - centres[c]) < Math.abs(best.x - centres[c]) ? p : best
        );
        passes.push(nearest.y);
      }
      return { key: `${e.v}->${e.w}`, from: e.v, to: e.w, passes };
    });
    return { nodes, edges: routeEdgeList };
  };

  // The gap between columns holds a lane for each edge crossing it.
  const leastGap = 48;
  let graph = layOut(leastGap);
  let routed = routing(graph);
  const gap =
    routeDefaults.leadOut +
    routeDefaults.leadIn +
    routeDefaults.spacing * (lanesNeeded(routed.nodes, routed.edges) + 1);
  if (gap > leastGap) {
    graph = layOut(gap);
    routed = routing(graph);
  }
  const routes = routeEdges(routed.nodes, routed.edges);
  const size = { width: 0, height: 0 };
  graph.nodes().forEach((k) => {
    const n = graph.node(k);
    size.width = Math.max(size.width, n.x + n.width / 2 + margin);
    size.height = Math.max(size.height, n.y + n.height / 2 + margin);
  });
  const byName = new Map(steps.map((s) => [s.name, s]));
  const specOf = new Map((spec || []).map((s) => [s.name, s]));
  React.useEffect(() => {
    onResize && onResize();
  }, [size.width, size.height, onResize]);
  const nestedResized = React.useCallback(() => setNestedResizes((n) => n + 1), []);

  return (
    <div ref={container} className="workflow-graph" style={{ width: size.width, height: size.height }}>
      <svg className="workflow-connectors" width={size.width} height={size.height}>
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="workflow-connector-head" />
          </marker>
        </defs>
        {edges.map((e) => {
          const target = byName.get(e.to);
          return (
            <path
              key={`${e.from}->${e.to}`}
              className={target && stepReached(target) ? 'workflow-connector reached' : 'workflow-connector'}
              data-from={e.from}
              data-to={e.to}
              fill="none"
              markerEnd={`url(#${markerId})`}
              d={orthoPath(routes[`${e.from}->${e.to}`] || [], 6)}
            />
          );
        })}
      </svg>
      {steps.map((step) => {
        const n = graph.node(step.name);
        const group = step.type == 'step-group';
        const open = group && (opened[step.name] ?? groupOpensItself(step));
        const groupSpec = specOf.get(step.name);
        return (
          <div
            key={name + step.name}
            className="workflow-step"
            data-step-key={step.name}
            style={{ left: n.x - n.width / 2, top: n.y - n.height / 2 }}
          >
            <Step
              step={step}
              width={stepWidth}
              group={group}
              open={open}
              onToggle={() => setOpened({ ...opened, [step.name]: !open })}
              selected={selected}
              actions={actions}
              onNodeClick={onNodeClick}
            >
              {open && (
                <StepGraph
                  name={`${name}/${step.name}`}
                  steps={step.subSteps}
                  spec={groupSpec?.subSteps}
                  mode={groupMode(groupSpec?.mode, undefined, subMode)}
                  selected={selected}
                  actions={actions}
                  onNodeClick={onNodeClick}
                  onResize={nestedResized}
                />
              )}
            </Step>
          </div>
        );
      })}
    </div>
  );
};

// PipelineGraph is a run's steps on a canvas that drags and zooms.
const PipelineGraph = (props: PipelineGraphProps) => (
  <Draggable>
    <div className="workflow-canvas" style={{ transform: `scale(${props.zoom})` }}>
      <StepGraph {...props} />
    </div>
  </Draggable>
);

export default PipelineGraph;
