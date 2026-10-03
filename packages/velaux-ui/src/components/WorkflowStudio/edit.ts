// Edits to a list of workflow steps, as the studio makes them.

type Step = { name: string; dependsOn?: string[] };

// insertAfter adds step to steps straight after anchor. Unless it is a branch,
// it goes in the middle: the steps that named anchor in their dependsOn name
// the new step instead, so they now wait on it. In parallel the new step waits
// on anchor; in order its place in the list does that. A step that waits on
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
  const added = opts.mode === 'DAG' ? { ...step, dependsOn: [anchor as string] } : step;
  const rest = steps.map((s) =>
    !opts.branch && s.dependsOn?.includes(anchor as string)
      ? { ...s, dependsOn: s.dependsOn.map((d) => (d === anchor ? step.name : d)) }
      : s
  );
  return [...rest.slice(0, at + 1), added, ...rest.slice(at + 1)];
}
