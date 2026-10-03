import type { Tone } from '../StatusBadge';

// podTone is a pod's status colour: its health where the cluster reports one,
// else whether every container is ready.
export function podTone(ready?: string, statusCode?: string): Tone {
  switch (statusCode) {
    case 'Healthy':
      return 'healthy';
    case 'Progressing':
      return 'progressing';
    case 'UnHealthy':
      return 'unhealthy';
  }
  if (!ready) {
    return 'neutral';
  }
  const [up, all] = ready.split('/');
  return up === all ? 'healthy' : 'progressing';
}
