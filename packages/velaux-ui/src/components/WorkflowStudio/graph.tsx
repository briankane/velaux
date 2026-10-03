import { Dropdown, Menu, Select } from '@alifd/next';
import classNames from 'classnames';
import React from 'react';
import { BsCollection, BsPlusLg, BsThreeDots } from 'react-icons/bs';

import type { WorkflowMode, WorkflowStep, WorkflowStepBase } from '@velaux/data';

import i18n from '../../i18n';
import { locale } from '../../utils/locale';
import { canMove, forwardWaits, stepEdges } from '../PipelineGraph/dependencies';
import { StepEdges, stepWidth, useStepLayout } from '../PipelineGraph/layout';
import { Translation } from '../Translation';
import '../PipelineGraph/index.less';

// AddAt is where a new step goes: into a group or the top level, at a place in
// the order, waiting on the steps given.
export type AddAt = { group?: string; index: number; dependsOn?: string[] };

type StudioGraphProps = {
  steps: WorkflowStep[];
  mode: WorkflowMode;
  // subMode is how a group's steps run unless the group names its own.
  subMode: WorkflowMode;
  // group is the step group these steps belong to, if any.
  group?: string;
  onAdd: (at: AddAt) => void;
  onEdit: (step: WorkflowStepBase, group?: string) => void;
  onDelete: (name: string, group?: string) => void;
  onGroupMode: (group: string, mode: WorkflowMode) => void;
  onMove: (name: string, group: string | undefined, delta: -1 | 1) => void;
  onResize?: () => void;
};

const modeOptions = () => [
  { value: 'StepByStep', label: i18n.t('In order').toString() },
  { value: 'DAG', label: i18n.t('In parallel').toString() },
];

const label = (step: { alias?: string; name: string }) => step.alias || step.name;

// StepMenu is a card's Edit and Delete.
// StepMenu is a card's Edit and Delete and, where steps run in order, its
// moves, each offered only where it keeps the step after what it waits on.
const StepMenu = (props: {
  onEdit: () => void;
  onDelete: () => void;
  onMove?: (delta: -1 | 1) => void;
  earlier?: boolean;
  later?: boolean;
}) => (
  <Dropdown
    triggerType="click"
    trigger={
      <button
        type="button"
        className="studio-step-menu"
        title={i18n.t('Step actions').toString()}
        onClick={(event) => event.stopPropagation()}
      >
        <BsThreeDots />
      </button>
    }
  >
    <Menu
      onItemClick={(key: string) => {
        if (key === 'delete') {
          props.onDelete();
        } else if (key === 'earlier' || key === 'later') {
          props.onMove && props.onMove(key === 'earlier' ? -1 : 1);
        } else {
          props.onEdit();
        }
      }}
      onClick={(event: React.MouseEvent) => event.stopPropagation()}
    >
      <Menu.Item key="edit">
        <Translation>Edit</Translation>
      </Menu.Item>
      {props.onMove && (
        <Menu.Item key="earlier" disabled={!props.earlier}>
          <Translation>Move earlier</Translation>
        </Menu.Item>
      )}
      {props.onMove && (
        <Menu.Item key="later" disabled={!props.later}>
          <Translation>Move later</Translation>
        </Menu.Item>
      )}
      <Menu.Item key="delete">
        <Translation>Delete</Translation>
      </Menu.Item>
    </Menu>
  </Dropdown>
);

const AddButton = (props: { title: string; style?: React.CSSProperties; onClick: () => void }) => (
  <button
    type="button"
    className="studio-add"
    style={props.style}
    title={i18n.t(props.title).toString()}
    onClick={(event) => {
      event.stopPropagation();
      props.onClick();
    }}
  >
    <BsPlusLg />
  </button>
);

// StudioGraph draws a workflow's steps for editing, laid out by what they wait
// on as a run is. In order, a + on each line inserts a step there; in
// parallel, a + on a card adds a step that waits on it. A group holds its own
// steps the same way, in its own mode.
export const StudioGraph = (props: StudioGraphProps) => {
  const { steps, mode, subMode, group, onAdd, onEdit, onDelete, onGroupMode, onMove, onResize } = props;
  const [, setNestedResizes] = React.useState(0);
  const nestedResized = React.useCallback(() => setNestedResizes((n) => n + 1), []);
  const edges = stepEdges(steps, steps, mode);
  // In order, a step waiting on a later one would wait for ever.
  const forward = mode === 'StepByStep' ? forwardWaits(steps) : [];
  const isForward = (from: string, to: string) => forward.some((f) => f.step === to && f.waitsOn === from);
  const menu = (step: WorkflowStep, index: number) => (
    <StepMenu
      onEdit={() => onEdit(step, group)}
      onDelete={() => onDelete(step.name, group)}
      onMove={mode === 'StepByStep' ? (delta) => onMove(step.name, group, delta) : undefined}
      earlier={canMove(steps, index, -1)}
      later={canMove(steps, index, 1)}
    />
  );
  const layout = useStepLayout(
    steps.map((s) => s.name),
    edges,
    onResize
  );

  return (
    <div className="studio-graph">
      <div ref={layout.container} className="run-graph" style={layout.size}>
        <StepEdges
          layout={layout}
          edges={edges}
          className={(e) => (isForward(e.from, e.to) ? 'workflow-connector forward' : 'workflow-connector reached')}
          front={(e) => isForward(e.from, e.to)}
        />
        {steps.map((step, index) => {
          const isGroup = step.type === 'step-group';
          const ownMode: WorkflowMode = (step.mode as WorkflowMode) || subMode;
          return (
            <div key={step.name} className="workflow-step" data-step-key={step.name} style={layout.place(step.name)}>
              <div
                className={classNames('step', 'studio-step', { group: isGroup, open: isGroup })}
                style={isGroup ? undefined : { width: stepWidth }}
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(step, group);
                }}
              >
                {isGroup && (
                  <div className="step-group-head">
                    <span className="step-group-tag">
                      <BsCollection />
                      <Translation>Group</Translation>
                    </span>
                    {menu(step, index)}
                  </div>
                )}
                <div className="studio-step-head">
                  <div className="step-name" title={label(step)}>
                    {label(step)}
                  </div>
                  {!isGroup && menu(step, index)}
                </div>
                <div className="step-meta">
                  {isGroup ? (
                    <>
                      <span className="step-type">
                        {step.subSteps?.length || 0} <Translation>steps</Translation>
                      </span>
                      <span className="studio-group-mode" onClick={(event) => event.stopPropagation()}>
                        <Select
                          size="small"
                          locale={locale().Select}
                          value={ownMode}
                          dataSource={modeOptions()}
                          title={i18n.t('How the steps in this group run').toString()}
                          onChange={(value: WorkflowMode) => onGroupMode(step.name, value)}
                        />
                      </span>
                    </>
                  ) : (
                    <span className="step-type">{step.type}</span>
                  )}
                </div>
                {forward
                  .filter((f) => f.step === step.name)
                  .map((f) => (
                    <div key={f.waitsOn} className="studio-warning">
                      {i18n.t('Waits on').toString()}{' '}
                      {label(steps.find((x) => x.name === f.waitsOn) || { name: f.waitsOn })},{' '}
                      {i18n.t('which runs after it, so this run would never finish').toString()}
                    </div>
                  ))}
                {!isGroup && step.description && (
                  <div className="step-caption" title={step.description}>
                    {step.description}
                  </div>
                )}
                {isGroup && (
                  <div className="step-group-body" onClick={(event) => event.stopPropagation()}>
                    <StudioGraph
                      steps={(step.subSteps || []) as WorkflowStep[]}
                      mode={ownMode}
                      subMode={subMode}
                      group={step.name}
                      onAdd={onAdd}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onGroupMode={onGroupMode}
                      onMove={onMove}
                      onResize={nestedResized}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {mode === 'StepByStep'
          ? steps.map((step, index) => {
              const b = layout.box(step.name);
              return (
                <AddButton
                  key={`add-${step.name}`}
                  title={index === 0 ? 'Add a step first' : 'Add a step here'}
                  style={{ left: b.left - 34, top: b.top + b.height / 2 - 10 }}
                  onClick={() => onAdd({ group, index })}
                />
              );
            })
          : steps.map((step, index) => {
              const b = layout.box(step.name);
              return (
                <AddButton
                  key={`add-${step.name}`}
                  title="Add a step after this one"
                  style={{ left: b.left + b.width - 10, top: b.top + b.height / 2 - 10 }}
                  onClick={() => onAdd({ group, index: index + 1, dependsOn: [step.name] })}
                />
              );
            })}
      </div>
      <button
        type="button"
        className="studio-add-step"
        onClick={(event) => {
          event.stopPropagation();
          onAdd({ group, index: steps.length });
        }}
      >
        <BsPlusLg />
        <Translation>{group ? 'Add a step to this group' : 'Add a step'}</Translation>
      </button>
    </div>
  );
};
