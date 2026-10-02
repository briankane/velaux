import type { ApplicationSourceStatus, ResourceTreeNode, SourceConsumer } from '@velaux/data';
import type { StatusTooltipProps } from '../StatusTooltip';
import { summaryEntries } from '../../utils/status';

// resourceTooltip summarises a resource on the graph: what and where it is, its
// health, and for a pod how it is running.
export function resourceTooltip(resource: ResourceTreeNode): StatusTooltipProps {
  const code = resource.healthStatus?.statusCode;
  const info = resource.additionalInfo || {};
  const text = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));
  const pod = resource.kind === 'Pod';
  return {
    title: resource.name,
    healthy: code === 'Healthy' ? true : code === 'UnHealthy' ? false : undefined,
    progressing: code === 'Progressing',
    summary: summaryEntries([
      ['Kind', resource.kind],
      ['API Version', resource.apiVersion],
      ['Namespace', resource.namespace],
      ['Cluster', resource.cluster],
      ['Status', pod ? text(info.Status) : undefined],
      ['Ready', pod ? text(info.Ready) : undefined],
      ['Restarts', pod ? text(info.Restarts) : undefined],
      ['Age', pod ? text(info.Age) : undefined],
      ['EIP', resource.kind === 'Service' ? text(info.EIP) : undefined],
      ['Reason', text(resource.healthStatus?.reason)],
    ]),
    message: text(resource.healthStatus?.message),
  };
}

// clusterTooltip summarises a cluster on the resource graph.
export function clusterTooltip(name: string): StatusTooltipProps {
  return { title: name, summary: [{ key: 'Kind', value: 'Cluster' }] };
}

// targetTooltip summarises a target, named cluster/namespace, on the service graph.
export function targetTooltip(name: string): StatusTooltipProps {
  const [cluster, namespace] = name.split('/');
  return {
    title: name,
    summary: summaryEntries([
      ['Cluster', cluster],
      ['Namespace', namespace],
    ]),
  };
}

// traitTooltip summarises a trait on the service graph.
export function traitTooltip(trait: {
  type: string;
  healthy: boolean;
  pending?: boolean;
  message?: string;
  details?: Record<string, string>;
}): StatusTooltipProps {
  return {
    title: trait.type,
    healthy: trait.healthy,
    pending: trait.pending,
    summary: [{ key: 'Kind', value: 'Trait' }],
    message: trait.message,
    details: trait.details,
  };
}

// sourceTooltip summarises a source binding on the service graph: its
// definition and phase, and its readers that have no node on the graph.
export function sourceTooltip(source: ApplicationSourceStatus, elsewhere: SourceConsumer[] = []): StatusTooltipProps {
  const phase = source.phase;
  return {
    title: source.name,
    healthy: phase === 'Resolved' ? true : phase === 'Failed' ? false : undefined,
    progressing: phase === 'Stale',
    summary: summaryEntries([
      ['Kind', 'Source'],
      ['Definition', source.type],
      ['Phase', phase],
      ['Auto update', source.autoUpdate === undefined ? undefined : source.autoUpdate ? 'On' : 'Off'],
      ['Readers', String((source.consumedBy || []).length)],
      ['Also read by', elsewhere.map((c) => `${c.name} (${c.definitionKind})`).join(', ') || undefined],
    ]),
    message: source.message || (source.resolutions || []).find((r) => r.message)?.message,
  };
}
