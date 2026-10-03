import classNames from 'classnames';
import React from 'react';

import type { WorkflowStepStatus } from '@velaux/data';
import { timeDiff } from '../../../utils/common';
import { StatusBadge } from '../../StatusBadge';

import { stepCaption, stepStatus } from '../status';

export interface StepProps {
  step: WorkflowStepStatus;
  width: number;
  group: boolean;
  selected?: string;
  // actions, where given, are drawn under a step waiting for approval.
  actions?: (step: WorkflowStepStatus) => React.ReactNode;
  onNodeClick: (step: WorkflowStepStatus) => void;
}

const waiting = (step: { phase?: string }) => step.phase === 'suspending';

const label = (step: { alias?: string; name?: string; id?: string }) => step.alias || step.name || step.id;

// Step is a step as a card: name and status, its type, then when it ran or why
// it failed. A step group lists its sub-steps as rows, each selectable.
export const Step = (props: StepProps) => {
  const { step, width, onNodeClick, group, selected, actions } = props;
  const waitingActions = (target: WorkflowStepStatus) =>
    actions && waiting(target) ? (
      <div className="step-actions" onClick={(event) => event.stopPropagation()}>
        {actions(target)}
      </div>
    ) : null;
  const status = stepStatus(step);
  const caption = stepCaption(step);
  return (
    <div
      className={classNames('step', `tone-${status.tone}`, {
        group: group,
        selected: !group && selected === step.id,
        pending: !step.phase,
      })}
      style={{ width: width + 'px' }}
      onClick={(event) => {
        if (!group) {
          onNodeClick(props.step);
          event.stopPropagation();
        }
      }}
    >
      <div className="step-name" title={label(step)}>
        {label(step)}
      </div>
      <div className="step-meta">
        <span className="step-type">{step.type}</span>
        <StatusBadge tone={status.tone} label={status.label} />
      </div>
      {!group && caption.text && (
        <div className={classNames('step-caption', { error: caption.error })} title={caption.text}>
          {caption.text}
        </div>
      )}
      {!group && waitingActions(step)}
      {group && (
        <div className="step-subs">
          {step.subSteps?.map((subStep, index) => (
            <React.Fragment key={'step-' + (subStep.id || subStep.name) + index}>
              <div
                className={classNames('step-sub', { selected: selected === subStep.id })}
                title={stepCaption(subStep).text || undefined}
                onClick={(event) => {
                  onNodeClick(subStep);
                  event.stopPropagation();
                }}
              >
                <span className={`step-sub-dot tone-${stepStatus(subStep).tone}`} title={stepStatus(subStep).label} />
                <span className="step-sub-name">{label(subStep)}</span>
                <span className="step-sub-time">
                  {subStep.firstExecuteTime ? timeDiff(subStep.firstExecuteTime, subStep.lastExecuteTime) : '-'}
                </span>
              </div>
              {waitingActions(subStep)}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
