import type { Tone } from '../../../../components/StatusBadge';

// recordStatus is how a workflow run's or step's phase shows: its badge's
// tone and label.
export function recordStatus(phase?: string): { tone: Tone; label: string } {
  switch (phase) {
    case 'succeeded':
      return { tone: 'healthy', label: 'Succeeded' };
    case 'failed':
      return { tone: 'failed', label: 'Failed' };
    case 'terminated':
      return { tone: 'failed', label: 'Terminated' };
    case 'suspending':
      return { tone: 'suspended', label: 'Waiting for approval' };
    case 'skipped':
      return { tone: 'neutral', label: 'Skipped' };
    case 'pending':
      return { tone: 'neutral', label: 'Pending' };
    case 'running':
    case 'executing':
    case 'initializing':
      return { tone: 'progressing', label: 'Running' };
    default:
      return { tone: 'neutral', label: phase ? phase[0].toUpperCase() + phase.slice(1) : 'Unknown' };
  }
}
