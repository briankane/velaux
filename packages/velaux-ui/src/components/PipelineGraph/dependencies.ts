// What a run's steps wait on, as edges between their names.

export type SpecStep = {
  name: string;
  dependsOn?: string[] | null;
  inputs?: Array<{ from: string }> | null;
  outputs?: Array<{ name: string }> | null;
};

export type StepEdge = { from: string; to: string };

// runMode is the mode a run's top-level steps ran in: the first half of a run's
// "<steps>-<subSteps>" mode, else the workflow's, else KubeVela's StepByStep.
export function runMode(recordMode?: string, workflowMode?: string): 'StepByStep' | 'DAG' {
  const mode = recordMode?.split('-')[0] || workflowMode;
  return mode === 'DAG' ? 'DAG' : 'StepByStep';
}

// stepEdges joins each step to the steps it waits on: the one before it in
// StepByStep mode, those it names in dependsOn, and those whose outputs feed
// its inputs. An edge a longer path already implies is left out.
export function stepEdges(steps: Array<{ name: string }>, spec: SpecStep[] | undefined, mode: string): StepEdge[] {
  const names = steps.map((s) => s.name);
  const known = new Set(names);
  const specOf = new Map((spec || []).map((s) => [s.name, s]));
  const producer = new Map<string, string>();
  (spec || []).forEach((s) => (s.outputs || []).forEach((o) => producer.set(o.name, s.name)));

  const waitsOn = new Map<string, Set<string>>();
  names.forEach((name, i) => {
    const deps = new Set<string>();
    if (mode !== 'DAG' && i > 0) {
      deps.add(names[i - 1]);
    }
    const s = specOf.get(name);
    (s?.dependsOn || []).forEach((d) => deps.add(d));
    (s?.inputs || []).forEach((input) => {
      const from = producer.get(input.from);
      if (from) {
        deps.add(from);
      }
    });
    deps.delete(name);
    waitsOn.set(name, new Set(Array.from(deps).filter((d) => known.has(d))));
  });

  // reaches is whether `to` waits on `from` through at least one other step.
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>();
    const stack = Array.from(waitsOn.get(to) || []).filter((d) => d !== from);
    while (stack.length) {
      const next = stack.pop() as string;
      if (next === from) {
        return true;
      }
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(...Array.from(waitsOn.get(next) || []));
      }
    }
    return false;
  };

  const edges: StepEdge[] = [];
  names.forEach((to) => {
    (waitsOn.get(to) || new Set<string>()).forEach((from) => {
      if (!reaches(from, to)) {
        edges.push({ from, to });
      }
    });
  });
  return edges;
}

// groupMode is the mode a step group's sub-steps run in: the group's own, else
// the second half of the run's mode, else the workflow's sub-mode, else
// KubeVela's DAG.
export function groupMode(own?: string, recordMode?: string, workflowSubMode?: string): 'StepByStep' | 'DAG' {
  const mode = own || recordMode?.split('-')[1] || workflowSubMode;
  return mode === 'StepByStep' ? 'StepByStep' : 'DAG';
}

// groupOpensItself is whether a step group is drawn open before anyone opens
// it: a sub-step is waiting, running or has failed.
export function groupOpensItself(group: { subSteps?: Array<{ phase?: string }> }): boolean {
  const attention = ['suspending', 'running', 'executing', 'failed', 'terminated', 'stopped'];
  return (group.subSteps || []).some((s) => !!s.phase && attention.includes(s.phase));
}
