import classNames from 'classnames';
import React from 'react';

import type { WorkflowStepStatus } from '@velaux/data';
import { timeDiff } from '../../../utils/common';
import { StatusBadge } from '../../StatusBadge';
import { Translation } from '../../Translation';

import { stepCaption, stepStatus } from '../status';

export interface StepProps {
  step: WorkflowStepStatus;
  output: boolean;
  input: boolean;
  probeState: {
    stepWidth: number;
    stepInterval: number;
  };
  group: boolean;
  selected?: string;
  onNodeClick: (step: WorkflowStepStatus) => void;
}

const label = (step: { alias?: string; name?: string; id?: string }) => step.alias || step.name || step.id;

// Step is a step as a card: name and status, its type, then when it ran or why
// it failed. A step group lists its sub-steps as rows, each selectable.
export const Step = (props: StepProps) => {
  const { step, output, input, onNodeClick, group, selected } = props;
  const { stepWidth, stepInterval } = props.probeState;
  const status = stepStatus(step);
  const caption = stepCaption(step);
  return (
    <div
      className={classNames('step', `tone-${status.tone}`, {
        group: group,
        selected: !group && selected === step.id,
        pending: !step.phase,
      })}
      style={{ marginRight: stepInterval + 'px', width: stepWidth + 'px' }}
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
        <span className="step-type">
          {step.type}
          {group && step.subSteps && (
            <span>
              {' · '}
              {step.subSteps.length} <Translation>steps</Translation>
            </span>
          )}
        </span>
        <StatusBadge tone={status.tone} label={status.label} />
      </div>
      {!group && caption.text && (
        <div className={classNames('step-caption', { error: caption.error })} title={caption.text}>
          {caption.text}
        </div>
      )}
      {group && (
        <div className="step-subs">
          {step.subSteps?.map((subStep, index) => (
            <div
              className={classNames('step-sub', { selected: selected === subStep.id })}
              key={'step-' + (subStep.id || subStep.name) + index}
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
          ))}
        </div>
      )}
      {output && <div className="workflow-step-port workflow-step-port-output" />}
      {input && <div className="workflow-step-port workflow-step-port-input" />}
    </div>
  );
};
