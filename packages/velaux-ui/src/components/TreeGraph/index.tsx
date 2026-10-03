import * as dagre from 'dagre';
import * as React from 'react';

// use the declaration file
import 'dagre-compound';
import kubevela from '../../assets/KubeVela-01.svg';
import kubernetes from '../../assets/kubernetes.svg';
import pod from '../../assets/resources/pod.svg';
import i18n from '../../i18n';
import type { ResourceTreeNode } from '@velaux/data';

import './index.less';
import classNames from 'classnames';

import { If } from '../If';

import { ComponentNode } from './component-node';
import type { GraphNode, TreeNode, GraphEdge } from './interface';
import { StatusTooltip, statusTooltipPopupClass } from '../StatusTooltip';
import { clusterTooltip, resourceTooltip, sourceTooltip, targetTooltip } from './tooltip';
import { treeNodeKey, getNodeSize, ResourceIcon } from './utils';
import type { Rect } from './layout';
import { edgePath, getGraphSize, joinThrough, rectBoundary, shiftIntoView } from './layout';

import { Link } from 'dva/router';
import { Dropdown, Menu, Tag, Balloon } from '@alifd/next';
import { FaEllipsisV } from 'react-icons/fa';
import { BsDatabase } from 'react-icons/bs';
import { sourcePhaseClass } from '../../pages/ApplicationStatus/components/ApplicationGraph/sources';
import { flowLabels, flowLine } from '../../pages/ApplicationStatus/components/ApplicationGraph/flows';
import { BiTransferAlt } from 'react-icons/bi';
import { HiOutlineNewspaper } from 'react-icons/hi';

// edgeOffset is how far from a laid-out point every edge is drawn.
const edgeOffset = { x: 40, y: 30 };

type TreeGraphProps = {
  node: TreeNode;
  zoom: number;
  appName: string;
  envName: string;
  nodesep: 50 | number;
  onResourceDetailClick: (resource: ResourceTreeNode) => void;
};

function renderResourceNode(props: TreeGraphProps, id: string, node: GraphNode) {
  const graphNode = (
    <div
      key={id}
      className={classNames('graph-node', 'graph-node-resource', {
        'error-status': node.resource.healthStatus?.statusCode == 'UnHealthy',
        'warning-status': node.resource.healthStatus?.statusCode == 'Progressing',
      })}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: `translate(-80px, 0px)`,
      }}
    >
      <div className={classNames('icon')}>
        <ResourceIcon kind={node.resource.kind || ''} />
      </div>
      <div className={classNames('name')}>
        <div>{node.resource.name}</div>
        <div className="kind">{node.resource.kind}</div>
      </div>
      <div className={classNames('actions')}>
        <Dropdown trigger={<FaEllipsisV />}>
          <Menu>
            <Menu.Item onClick={() => props.onResourceDetailClick(node.resource)}>Detail</Menu.Item>
          </Menu>
        </Dropdown>
      </div>
      <If condition={node.resource.kind === 'Service' && node.resource.additionalInfo?.EIP}>
        <div className={classNames('additional')}>
          <Tag size="small" color="orange">
            EIP: {node.resource.additionalInfo?.EIP}
          </Tag>
        </div>
      </If>
    </div>
  );
  return (
    <Balloon trigger={graphNode} closable={false} popupClassName={statusTooltipPopupClass}>
      <StatusTooltip {...resourceTooltip(node.resource)} />
    </Balloon>
  );
}

function renderAppNode(props: TreeGraphProps, id: string, node: GraphNode) {
  const graphNode = (
    <div
      key={id}
      className={classNames('graph-node', 'graph-node-app')}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: `translate(-60px, 0px)`,
      }}
    >
      <div className={classNames('icon')}>
        <img src={kubevela} />
      </div>
      <div className={classNames('name')}>
        <span>{node.resource.name}</span>
      </div>
      <div className={classNames('actions')}>
        <Dropdown trigger={<FaEllipsisV />}>
          <Menu>
            <Menu.Item onClick={() => props.onResourceDetailClick(node.resource)}>Detail</Menu.Item>
          </Menu>
        </Dropdown>
      </div>
    </div>
  );
  return (
    <Balloon trigger={graphNode} closable={false} popupClassName={statusTooltipPopupClass}>
      <StatusTooltip {...resourceTooltip(node.resource)} />
    </Balloon>
  );
}

function renderPodNode(props: TreeGraphProps, id: string, node: GraphNode) {
  const { appName, envName } = props;
  const graphNode = (
    <div
      key={id}
      className={classNames('graph-node', 'graph-node-pod', {
        'error-status': node.resource.healthStatus?.statusCode == 'UnHealthy',
        'warning-status': node.resource.healthStatus?.statusCode == 'Progressing',
      })}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: `translate(-80px, 0px)`,
      }}
    >
      <div className={classNames('icon')}>
        <img src={pod} />
        <span>Pod</span>
      </div>
      <div className={classNames('name')}>
        <Link to={`/applications/${appName}/envbinding/${envName}/instances?pod=${node.resource.name}`}>
          {node.resource.name}
        </Link>
        <div className={classNames('actions')}>
          <Link to={`/applications/${appName}/envbinding/${envName}/logs?pod=${node.resource.name}`}>
            <HiOutlineNewspaper title={i18n.t('Logger')} />
          </Link>
        </div>
      </div>
      <div className={classNames('actions')}>
        <Dropdown trigger={<FaEllipsisV />}>
          <Menu>
            <Menu.Item onClick={() => props.onResourceDetailClick(node.resource)}>Detail</Menu.Item>
          </Menu>
        </Dropdown>
      </div>
      <div className={classNames('additional')}>
        <Tag size="small" color="orange">
          Ready: {node.resource.additionalInfo?.Ready}
        </Tag>
      </div>
    </div>
  );
  return (
    <Balloon trigger={graphNode} closable={false} popupClassName={statusTooltipPopupClass}>
      <StatusTooltip {...resourceTooltip(node.resource)} />
    </Balloon>
  );
}

function renderClusterNode(props: TreeGraphProps, id: string, node: GraphNode) {
  const graphNode = (
    <div
      className={classNames('graph-node', 'graph-node-cluster')}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: `translate(-40px, 0px)`,
      }}
    >
      <div className="icon">
        <img src={kubernetes} />
      </div>
      <div className={classNames('name')}>
        <div>{node.resource.name}</div>
        <div className="kind">Cluster</div>
      </div>
    </div>
  );
  return (
    <Balloon trigger={graphNode} closable={false} popupClassName={statusTooltipPopupClass}>
      <StatusTooltip {...clusterTooltip(node.resource.name)} />
    </Balloon>
  );
}

function renderTargetNode(props: TreeGraphProps, id: string, node: GraphNode) {
  const graphNode = (
    <div
      className={classNames('graph-node', 'graph-node-cluster')}
      style={{
        left: node.x - 30,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: `translate(-40px, 0px)`,
      }}
    >
      <div className="icon">
        <img src={kubernetes} />
      </div>
      <div className={classNames('name')}>
        <div>{node.resource.name}</div>
        <div className="kind">Target</div>
      </div>
    </div>
  );
  return (
    <Balloon trigger={graphNode} closable={false} popupClassName={statusTooltipPopupClass}>
      <StatusTooltip {...targetTooltip(node.resource.name)} />
    </Balloon>
  );
}

// renderSourceNode is a spec.sources binding: its name, the SourceDefinition
// resolving it, and its phase as the node's status.
function renderSourceNode(props: TreeGraphProps, id: string, node: GraphNode) {
  const source = node.source;
  const graphNode = (
    <div
      key={id}
      className={classNames('graph-node', 'graph-node-source', sourcePhaseClass(source?.phase))}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: `translate(-80px, 0px)`,
      }}
    >
      <div className="icon">
        <BsDatabase />
      </div>
      <div className={classNames('name')}>
        <div>{node.resource.name}</div>
        <div className="kind">
          {source?.type || 'Source'}
          {source?.phase && <span className="source-phase"> · {i18n.t(source.phase)}</span>}
        </div>
      </div>
    </div>
  );
  return (
    <Balloon trigger={graphNode} closable={false} popupClassName={statusTooltipPopupClass}>
      {source && <StatusTooltip {...sourceTooltip(source, node.readersElsewhere)} />}
    </Balloon>
  );
}

// renderFlowNode labels a dependency with what moves along it: how many fields
// pass, or none for an order alone; all of them on hover. It sits on its edge,
// centred where the edge is drawn through.
function renderFlowNode(id: string, node: GraphNode) {
  const flow = node.flow;
  if (!flow) {
    return null;
  }
  const lines = flow.items.map((item) => flowLine(item));
  const orderOnly = flow.via === 'dependsOn';
  const graphNode = (
    <div
      key={id}
      className={classNames('graph-node', 'graph-node-flow', `flow-${flow.via}`)}
      style={{
        left: node.x + edgeOffset.x - node.width / 2,
        top: node.y + edgeOffset.y - node.height / 2,
        width: node.width,
        height: node.height,
      }}
    >
      <BiTransferAlt />
      {!orderOnly && <span className="flow-count">{lines.length}</span>}
    </div>
  );
  return (
    <Balloon trigger={graphNode} closable={false} popupClassName={statusTooltipPopupClass}>
      <StatusTooltip
        title={i18n.t(flowLabels[flow.via]).toString()}
        summary={[
          { key: 'From', value: flow.from.name },
          { key: 'To', value: flow.to.name },
        ]}
        message={orderOnly ? i18n.t('Waits for it to be healthy; no data passes').toString() : undefined}
        sections={
          lines.length === 0
            ? []
            : [
                {
                  title: 'Values',
                  count: lines.length,
                  open: true,
                  content: (
                    <ul className="flow-list">
                      {lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ),
                },
              ]
        }
      />
    </Balloon>
  );
}

function setNode(graph: dagre.graphlib.Graph<GraphNode, GraphEdge>, node: TreeNode) {
  const size = getNodeSize(node);
  graph.setNode(treeNodeKey(node), {
    ...node,
    width: size.width,
    height: size.height,
    x: 0,
    y: 0,
  });

  node.leafNodes?.map((subNode) => {
    if (treeNodeKey(node) == treeNodeKey(subNode)) {
      return;
    }
    graph.setEdge(treeNodeKey(node), treeNodeKey(subNode), {});
    setNode(graph, subNode);
  });
  node.detached?.forEach((sub) => setNode(graph, sub));
}

// setLinks adds each node's links as edges, to nodes the tree put on the graph.
function setLinks(graph: dagre.graphlib.Graph<GraphNode, GraphEdge>, node: TreeNode) {
  const key = treeNodeKey(node);
  (node.links || []).forEach((to) => {
    if (graph.hasNode(to)) {
      graph.setEdge(key, to, { link: true });
    }
  });
  (node.linksFrom || []).forEach((from) => {
    if (graph.hasNode(from)) {
      graph.setEdge(from, key, { link: true });
    }
  });
  node.leafNodes?.forEach((sub) => setLinks(graph, sub));
  node.detached?.forEach((sub) => setLinks(graph, sub));
}

// graphCount numbers each graph drawn, so its arrowheads' ids are its own.
let graphCount = 0;

export const TreeGraph = (props: TreeGraphProps) => {
  const [markerId] = React.useState(() => `graph-${++graphCount}`);
  // rects are the boxes the nodes are drawn as, measured once they are, so
  // edges end on them: a node may grow past the size the layout gave it.
  const [rects, setRects] = React.useState<Record<string, Rect>>({});
  const container = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const tree = container.current;
    if (!tree) {
      return;
    }
    // Boxes are measured as drawn on screen, transforms included, back in the
    // graph's own units: the graph itself is scaled by the zoom.
    const origin = tree.getBoundingClientRect();
    const zoom = props.zoom || 1;
    const measured: Record<string, Rect> = {};
    tree.querySelectorAll<HTMLElement>('[data-node-key]').forEach((wrapper) => {
      const box = wrapper.firstElementChild as HTMLElement | null;
      if (box) {
        const r = box.getBoundingClientRect();
        measured[wrapper.dataset.nodeKey || ''] = {
          left: Math.round((r.left - origin.left) / zoom),
          top: Math.round((r.top - origin.top) / zoom),
          width: Math.round(r.width / zoom),
          height: Math.round(r.height / zoom),
        };
      }
    });
    if (JSON.stringify(measured) !== JSON.stringify(rects)) {
      setRects(measured);
    }
  });

  // init the graph
  const graph = new dagre.graphlib.Graph<GraphNode, GraphEdge>();
  graph.setGraph({
    nodesep: props.nodesep,
    rankdir: 'LR',
  });

  // set node and make layout; links join nodes across the tree once every
  // node is in it
  setNode(graph, props.node);
  setLinks(graph, props.node);
  dagre.layout(graph);
  shiftIntoView(
    graph.nodes().map((id) => graph.node(id)),
    graph.edges().map((e) => graph.edge(e).points || []),
    20
  );

  // An edge runs along the layout's route, its ends moved onto the boxes its
  // nodes are drawn as, once they are measured. A flow is a label on its
  // dependency, not a stop: the edges into and out of it are drawn as one,
  // through its centre.
  const route = (e: { v: string; w: string }) =>
    (graph.edge(e).points || []).map((p) => ({ x: p.x + edgeOffset.x, y: p.y + edgeOffset.y }));
  const flowAt = (key: string) => (graph.node(key)?.nodeType === 'flow' ? graph.node(key) : undefined);
  const edges: Array<{ key: string; path: string; link?: boolean }> = [];
  graph.edges().forEach((edgeInfo) => {
    if (flowAt(edgeInfo.w)) {
      return;
    }
    const flow = flowAt(edgeInfo.v);
    const routes: Array<{ from: string; points: Array<{ x: number; y: number }> }> = flow
      ? ((graph.inEdges(edgeInfo.v) || []) as unknown as Array<{ v: string; w: string }>).map((into) => ({
          from: into.v,
          points: joinThrough(route(into), { x: flow.x + edgeOffset.x, y: flow.y + edgeOffset.y }, route(edgeInfo)),
        }))
      : [{ from: edgeInfo.v, points: route(edgeInfo) }];
    routes.forEach(({ from, points }) => {
      const source = rects[from];
      const target = rects[edgeInfo.w];
      if (points.length >= 2) {
        if (source) {
          points[0] = rectBoundary(points[1], source);
        }
        if (target) {
          points[points.length - 1] = rectBoundary(points[points.length - 2], target);
        }
      }
      edges.push({
        key: `${from}-${edgeInfo.v}-${edgeInfo.w}`,
        path: edgePath(points),
        link: !!graph.edge(edgeInfo).link && flow?.flow?.via !== 'dependsOn',
      });
    });
  });

  const graphNodes = graph.nodes();

  const size = getGraphSize(graphNodes.map((id) => graph.node(id)));
  // renderNode draws one laid-out node as its type is drawn.
  const renderNode = (key: string) => {
    const node = graph.node(key);
    const nodeType = node.nodeType;
    switch (nodeType) {
      case 'app':
        return <React.Fragment key={key}>{renderAppNode(props, key, node)}</React.Fragment>;
      case 'cluster':
        return <React.Fragment key={key}>{renderClusterNode(props, key, node)}</React.Fragment>;
      case 'target':
        return <React.Fragment key={key}>{renderTargetNode(props, key, node)}</React.Fragment>;
      case 'pod':
        return <React.Fragment key={key}>{renderPodNode(props, key, node)}</React.Fragment>;
      case 'component':
        return <ComponentNode key={key} node={node} showTrait={false} />;
      case 'source':
        return <React.Fragment key={key}>{renderSourceNode(props, key, node)}</React.Fragment>;
      case 'flow':
        return <React.Fragment key={key}>{renderFlowNode(key, node)}</React.Fragment>;
      default:
        return <React.Fragment key={key}>{renderResourceNode(props, key, node)}</React.Fragment>;
    }
  };

  return (
    <div
      ref={container}
      className="graph-tree"
      style={{
        width: size.width + 500,
        height: size.height + 150,
        transformOrigin: '0% 0%',
        transform: `scale(${props.zoom})`,
      }}
    >
      <svg className="graph-edges" width={size.width + 500} height={size.height + 150} aria-hidden="true">
        <defs>
          <marker
            id={`${markerId}-edge`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="graph-edge-head" />
          </marker>
          <marker
            id={`${markerId}-link`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="graph-edge-head graph-edge-head-link" />
          </marker>
        </defs>
        {edges.map((edge) => (
          <path
            key={edge.key}
            d={edge.path}
            className={classNames('graph-edge-path', { 'graph-edge-link': edge.link })}
            markerEnd={`url(#${markerId}-${edge.link ? 'link' : 'edge'})`}
          />
        ))}
      </svg>
      {graphNodes.map((key) => (
        <div key={key} data-node-key={key} className="graph-node-slot">
          {renderNode(key)}
        </div>
      ))}
    </div>
  );
};
