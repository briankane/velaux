import type { SharedWorkflow } from '@velaux/data';

// usableShared is whether a workflow of an environment can run the shared one:
// not a global one hidden by the project's of its name, nor the project's where
// the environment's Applications run outside the project's namespace.
export const usableShared = (s: SharedWorkflow, projectUnavailable?: boolean) =>
  !s.hidden && !(projectUnavailable && s.scope === 'project');
