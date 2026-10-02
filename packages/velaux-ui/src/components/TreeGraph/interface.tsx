import type { ApplicationSourceStatus, SourceConsumer, TraitStatus, ResourceTreeNode } from '@velaux/data';

import type { DependencyItem } from '../../utils/dependencies';

export interface TreeNode {
  resource: ResourceTreeNode;
  nodeType: 'app' | 'cluster' | 'component' | 'trait' | 'policy' | 'resource' | 'pod' | 'target' | 'source';
  leafNodes?: TreeNode[];
  // For a component node: what it depends on and what depends on it.
  dependencies?: DependencyItem[];
  // links are the graph keys of nodes this one feeds outside the tree, drawn
  // dashed: a source's readers.
  links?: string[];
  // For a source node: the binding's status, and its readers with no node here.
  source?: ApplicationSourceStatus;
  readersElsewhere?: SourceConsumer[];
}

export interface Node {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphNode extends Node, TreeNode {}

export interface TraitGraphNode extends Node {
  trait?: TraitStatus;
}

export interface GraphEdge {
  points?: Array<{ x: number; y: number }>;
  [key: string]: any;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
