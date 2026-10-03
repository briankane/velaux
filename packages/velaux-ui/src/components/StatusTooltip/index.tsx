import { Balloon } from '@alifd/next';
import classNames from 'classnames';
import React, { useState } from 'react';
import { AiOutlineRight } from 'react-icons/ai';

import { detailEntries } from '../../utils/status';
import type { DetailEntry } from '../../utils/status';
import { DetailList } from '../StatusDetails';
import { Translation } from '../Translation';

import './index.less';

// Balloons render in a portal on the body, so their content is styled through
// this popup class rather than from the graph's stylesheet.
export const statusTooltipPopupClass = 'status-tooltip-popup';

// TooltipSection is a part of the tooltip folded away behind its title and a
// count until asked for.
export interface TooltipSection {
  title: string;
  count: number;
  content: React.ReactNode;
  // open shows the section expanded to begin with.
  open?: boolean;
}

export interface StatusTooltipProps {
  title: string;
  // on is what the titled thing is attached to, shown under the title.
  on?: string;
  // healthSource is what read the health where VelaUX, not KubeVela, did: its
  // badge then says so on hover, with a link to it.
  healthSource?: 'kstatus';
  healthy?: boolean;
  // pending is a trait waiting for its workload, shown in place of its health.
  pending?: boolean;
  // progressing is a resource still rolling out, shown in place of its health.
  progressing?: boolean;
  summary?: DetailEntry[];
  message?: string;
  sections?: TooltipSection[];
  details?: Record<string, string>;
}

function CollapsibleSection(props: TooltipSection) {
  const [open, setOpen] = useState(!!props.open);
  return (
    <div className="status-tooltip-section">
      <button type="button" className="status-tooltip-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <AiOutlineRight className={classNames('status-tooltip-chevron', { open })} />
        <Translation>{props.title}</Translation>
        <span className="status-tooltip-count">{props.count}</span>
      </button>
      {open && <div className="status-tooltip-section-content">{props.content}</div>}
    </div>
  );
}

// kstatusDocs is kstatus's own account of how it reads an object's status.
const kstatusDocs = 'https://github.com/kubernetes-sigs/cli-utils/blob/master/pkg/kstatus/README.md';

// HealthSource shows a health badge and, where VelaUX read the health with
// kstatus, a small circled k after it whose hover says so, with a link to the
// project.
const HealthSource = (props: { source?: 'kstatus'; children: React.ReactNode }) => {
  if (props.source !== 'kstatus') {
    return <>{props.children}</>;
  }
  return (
    <span className="status-tooltip-health-source">
      {props.children}
      <Balloon
        trigger={
          <span className="status-tooltip-source-mark" aria-label="kstatus">
            k
          </span>
        }
        closable={false}
        align="t"
        popupClassName="status-tooltip-source-popup"
      >
        <Translation>Based on</Translation>{' '}
        <a href={kstatusDocs} target="_blank" rel="noopener noreferrer">
          kstatus
        </a>
      </Balloon>
    </span>
  );
};

// StatusTooltip summarises a node on the graph, with its
// sections, then its status details, folded away until asked for.
export const StatusTooltip = (props: StatusTooltipProps) => {
  const details = detailEntries(props.details);
  const summary = props.summary || [];
  const sections = [...(props.sections || [])];
  if (details.length > 0) {
    sections.push({ title: 'Details', count: details.length, content: <DetailList entries={details} /> });
  }
  return (
    <div className="status-tooltip">
      <div className="status-tooltip-header">
        <span className="status-tooltip-heading">
          <span className="status-tooltip-title">{props.title}</span>
          {props.on && (
            <span className="status-tooltip-on">
              <Translation>on</Translation> {props.on}
            </span>
          )}
        </span>
        <HealthSource source={props.healthSource}>
          {props.pending || props.progressing ? (
            <span className="status-tooltip-health pending">
              <span className="circle circle-pending" />
              <Translation>{props.pending ? 'Pending' : 'Progressing'}</Translation>
            </span>
          ) : (
            props.healthy !== undefined && (
              <span className={classNames('status-tooltip-health', { unhealthy: !props.healthy })}>
                <span className={classNames('circle', props.healthy ? 'circle-success' : 'circle-warning')} />
                <Translation>{props.healthy ? 'Healthy' : 'Unhealthy'}</Translation>
              </span>
            )
          )}
        </HealthSource>
      </div>
      {summary.length > 0 && <DetailList entries={summary} />}
      {props.message && <div className="status-tooltip-message">{props.message}</div>}
      {sections.map((section) => (
        <CollapsibleSection key={section.title} {...section} />
      ))}
    </div>
  );
};
