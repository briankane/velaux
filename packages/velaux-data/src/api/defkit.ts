// DefKitSource is where a DefKit module comes from and how it is rendered:
// a Go module path (ref) or a git repository (git).
export interface DefKitSource {
  ref?: string;
  git?: string;
  // version is a module version or, with git, a branch, tag or commit.
  version?: string;
  prefix?: string;
  types?: string[];
}

export interface DefKitMaintainer {
  name: string;
  email?: string;
}

// DefKitModuleInfo is what a module says about itself, as its last render read it.
export interface DefKitModuleInfo {
  name: string;
  resolvedVersion?: string;
  description?: string;
  maintainers?: DefKitMaintainer[];
  categories?: string[];
  hasHooks?: boolean;
}

export type DefKitPhase = 'rendering' | 'review' | 'applying' | 'applied' | 'failed';

// DefKitModule is an installed module: an Application of the defkit addon.
export interface DefKitModule {
  name: string;
  source: DefKitSource;
  phase: DefKitPhase;
  message?: string;
  info?: DefKitModuleInfo;
  // counts are the installed definitions by kind.
  counts: Record<string, number>;
  updateTime: string;
}

export interface DefKitDefinition {
  kind: string;
  name: string;
  description?: string;
}

export interface DefKitModuleDetail extends DefKitModule {
  definitions: DefKitDefinition[];
}

export type DefKitItemStatus = 'new' | 'changed' | 'unchanged' | 'conflict' | 'removed';

// DefKitPreviewItem is one definition a pending render would change, or leave.
export interface DefKitPreviewItem extends DefKitDefinition {
  status: DefKitItemStatus;
  current?: string;
  next?: string;
}

export interface DefKitPreview {
  phase: DefKitPhase;
  message?: string;
  info?: DefKitModuleInfo;
  errors?: string[];
  items: DefKitPreviewItem[];
}
