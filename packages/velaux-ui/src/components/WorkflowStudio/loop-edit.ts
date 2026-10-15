// Edits to a workflow's loops, as the studio makes them. A loop is a top-level
// step or step group with forEach; the steps it repeats read the current item
// through inputs from each.item and each.index.

type ForEachLike = { items?: unknown; from?: string; mode?: string };

type LoopStep = { name: string; forEach?: ForEachLike; subSteps?: Array<{ name: string }> };

// defaultMaxItems is the controller's --max-for-each-items unless the cluster
// sets its own.
const defaultMaxItems = 50;

// setLoop makes the step called name repeat over forEach, or, given none, stop
// repeating.
export function setLoop<T extends LoopStep>(steps: T[], name: string, forEach: ForEachLike | undefined): T[] {
  return steps.map((s) => {
    if (s.name !== name) {
      return s;
    }
    const { forEach: _, ...rest } = s;
    return (forEach ? { ...rest, forEach } : rest) as T;
  });
}

// itemColumns are the keys of a list's object items, in the order first seen;
// a list of plain values has none.
export function itemColumns(items: unknown[]): string[] {
  const keys: string[] = [];
  items.forEach((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      Object.keys(item).forEach((k) => !keys.includes(k) && keys.push(k));
    }
  });
  return keys;
}

// loopInputs are what a step inside a loop may read through its inputs: the
// item, its index, and each key of typed-in object items. A step outside any
// loop gets none.
export function loopInputs(steps: LoopStep[], stepName?: string): string[] {
  const loop = steps.find(
    (s) => s.forEach && (s.name === stepName || (s.subSteps || []).some((sub) => sub.name === stepName))
  );
  if (!loop?.forEach) {
    return [];
  }
  const items = Array.isArray(loop.forEach.items) ? loop.forEach.items : [];
  return ['each.item', 'each.index', ...itemColumns(items).map((k) => `each.item.${k}`)];
}

// forEachProblem is what stops a loop's items from being saved: none typed in,
// no output picked, or an expression that is not one whole $( ).
export function forEachProblem(forEach: ForEachLike): string | undefined {
  if ('from' in forEach) {
    return forEach.from ? undefined : 'Pick the output the items come from';
  }
  if (Array.isArray(forEach.items)) {
    return forEach.items.length === 0 ? 'Add at least one item' : undefined;
  }
  const expression = typeof forEach.items === 'string' ? forEach.items.trim() : '';
  return /^\$\(.*\)$/s.test(expression) ? undefined : 'An expression is written $( ... ), and gives the whole list';
}

// forEachWarning is said of typed-in items over the controller's default limit,
// which a cluster may have raised.
export function forEachWarning(forEach: ForEachLike): string | undefined {
  if (Array.isArray(forEach.items) && forEach.items.length > defaultMaxItems) {
    return `Over ${defaultMaxItems} items, the controller's default limit. The run fails unless the cluster raised it`;
  }
  return undefined;
}
