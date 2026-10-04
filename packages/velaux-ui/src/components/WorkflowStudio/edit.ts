// Edits to a list of workflow steps, as the studio makes them.

type Step = { name: string; dependsOn?: string[] };

// insertAfter adds step to steps straight after anchor. Unless it is a branch,
// it goes in the middle: the steps that named anchor in their dependsOn name
// the new step instead, so they now wait on it. In parallel the new step waits
// on anchor unless it names its own dependsOn; in order its place in the list
// does that. A step that waits on
// anchor only through its inputs is left alone, as redirecting it would change
// what it reads. With no anchor, the step goes last, waiting on nothing.
export function insertAfter<T extends Step>(
  steps: T[],
  anchor: string | undefined,
  step: T,
  opts: { mode: string; branch: boolean }
): T[] {
  const at = anchor ? steps.findIndex((s) => s.name === anchor) : -1;
  if (at < 0) {
    return [...steps, step];
  }
  const added = opts.mode === 'DAG' && !step.dependsOn ? { ...step, dependsOn: [anchor as string] } : step;
  const rest = steps.map((s) =>
    !opts.branch && s.dependsOn?.includes(anchor as string)
      ? { ...s, dependsOn: s.dependsOn.map((d) => (d === anchor ? step.name : d)) }
      : s
  );
  return [...rest.slice(0, at + 1), added, ...rest.slice(at + 1)];
}

type Waiting = Step & { inputs?: Array<{ from: string }>; outputs?: Array<{ name: string }> };

// addPreview is what adding after anchor would do to the steps that follow it:
// moved are those that would wait on the new step instead, stay those that
// would keep waiting on anchor. A new step or group takes the steps that name
// anchor in dependsOn and, in order, the next in the list; a branch takes none.
// A step that waits only through its inputs always stays.
export function addPreview(
  steps: Waiting[],
  anchor: string,
  key: string,
  mode: string
): { moved: string[]; stay: string[] } {
  const at = steps.findIndex((s) => s.name === anchor);
  const produced = new Set((steps[at]?.outputs || []).map((o) => o.name));
  const named = steps.filter((s) => s.dependsOn?.includes(anchor)).map((s) => s.name);
  const next = mode !== 'DAG' && at >= 0 && at + 1 < steps.length ? [steps[at + 1].name] : [];
  const reads = steps
    .filter((s) => s.name !== anchor && (s.inputs || []).some((i) => produced.has(i.from)))
    .map((s) => s.name);
  const inOrder = (names: string[]) => steps.map((s) => s.name).filter((n) => names.includes(n));
  if (key === 'branch') {
    return { moved: [], stay: inOrder([...named, ...reads, ...next]) };
  }
  const moved = inOrder([...named, ...next]);
  return { moved, stay: inOrder(reads.filter((n) => !moved.includes(n))) };
}
