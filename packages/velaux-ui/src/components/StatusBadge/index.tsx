import React from 'react';

import { Translation } from '../Translation';
import './index.less';

// Tone is the colour a status takes, worst last.
export type Tone = 'healthy' | 'progressing' | 'suspended' | 'neutral' | 'unhealthy' | 'failed' | 'undeployed';

// StatusBadge is a status as a coloured pill with a dot, and anything more
// about the status after its label.
export const StatusBadge = (props: { tone: Tone; label: string; title?: string; children?: React.ReactNode }) => (
  <span className={`status-badge tone-${props.tone}`} title={props.title}>
    <span className="status-dot" />
    <Translation>{props.label}</Translation>
    {props.children}
  </span>
);
