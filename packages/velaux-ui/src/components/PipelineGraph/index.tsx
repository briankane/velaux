import * as dagre from 'dagre';
import React from 'react';
import Draggable from 'react-draggable';

import type { WorkflowStepStatus } from '@velaux/data';

import './index.less';
import type { RouteEdge, RouteNode } from '../TreeGraph/orthogonal';
import { lanesNeeded, orthoPath, routeDefaults, routeEdges } from '../TreeGraph/orthogonal';
import { Step } from './components/step';
import type { SpecStep } from './dependencies';
import { stepEdges } from './dependencies';
import { stepReached } from './status';

type PipelineGraphProps = {
  name?: string;
  steps?: WorkflowStepStatus[];
  // spec and mode are the workflow the run follows, which its edges come from.
  spec?: SpecStep[];
  mode: 'StepByStep' | 'DAG';
  zoom: number;
  // selected is the id of the step whose details are open.
  selected?: string;
  // actions are drawn under a step waiting for approval.
  actions?: (step: WorkflowStepStatus) => React.ReactNode;
  onNodeClick: (step: WorkflowStepStatus) => void;
};

const stepWidth = 270;
const margin = 20;
// cardHeight stands in for a card not yet measured.
const cardHeight = 90;

type LaidStep = { width: number; height: number; x: number; y: number };
type LaidEdge = { points?: Array<{ x: number; y: number }> };
type Laid = dagre.graphlib.Graph<LaidStep, LaidEdge>;

// graphCount numbers each graph drawn, so its arrowhead's id is its own.
let graphCount = 0;

// PipelineGraph draws a run's steps left to right by what they wait on: a step
// sits right of every step it depends on, and steps that do not wait on each
// other share a column.
const PipelineGraph = (props: PipelineGraphProps) => {
  const { steps = [], spec, mode, zoom, name, selected, actions, onNodeClick } = props;
  const [markerId] = React.useState(() => `pipeline-${++graphCount}`);
  // heights are the cards as drawn: a group or a waiting step grows.
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const container = React.useRef<HTMLDivElement>(null);
  // Measured after every render, as a card's height follows its step's state;
  // it settles once the heights stop changing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const measured: Record<string, number> = {};
    container.current?.querySelectorAll<HTMLElement>('[data-step-key]').forEach((el) => {
      measured[el.dataset.stepKey || ''] = el.offsetHeight;
    });
    if (JSON.stringify(measured) !== JSON.stringify(heights)) {
      setHeights(measured);
    }
  });

  const edges = stepEdges(steps, spec, mode);
  const layOut = (ranksep: number) => {
    const g: Laid = new dagre.graphlib.Graph<LaidStep, LaidEdge>();
    g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep });
    steps.forEach((s) => g.setNode(s.name, { width: stepWidth, height: heights[s.name] || cardHeight, x: 0, y: 0 }));
    edges.forEach((e) => g.setEdge(e.from, e.to, {}));
    dagre.layout(g);
    // Everything moves in by the margin, edge points with the nodes.
    g.nodes().forEach((k) => {
      g.node(k).x += margin;
      g.node(k).y += margin;
    });
    g.edges().forEach((e) =>
      (g.edge(e).points || []).forEach((p) => {
        p.x += margin;
        p.y += margin;
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
    size.height = Math.max(size.height, n.y + (heights[k] || n.height) / 2 + margin);
  });
  const byName = new Map(steps.map((s) => [s.name, s]));

  return (
    <Draggable>
      <div
        ref={container}
        className="workflow-graph"
        style={{ transform: `scale(${zoom})`, width: size.width, height: size.height }}
      >
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
          return (
            <div
              key={name + step.name}
              className="workflow-step"
              data-step-key={step.name}
              style={{ left: n.x - n.width / 2, top: n.y - (heights[step.name] || cardHeight) / 2, width: stepWidth }}
            >
              <Step
                step={step}
                width={stepWidth}
                group={step.type == 'step-group'}
                selected={selected}
                actions={actions}
                onNodeClick={onNodeClick}
              />
            </div>
          );
        })}
      </div>
    </Draggable>
  );
};

export default PipelineGraph;
