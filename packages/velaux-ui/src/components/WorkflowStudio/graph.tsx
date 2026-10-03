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

// AddAt is what to add and where: a step or a group, into a group or the top
// level, after a step (in the middle, or as a branch from it) or last.
export type AddAt = { kind: 'step' | 'group'; group?: string; after?: string; branch?: boolean };

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

type AddItem = { key: string; label: string; disabled?: boolean; note?: string };

// AddMenu is a + that opens the things that can be added from where it sits.
const AddMenu = (props: { items: AddItem[]; onPick: (key: string) => void; children: React.ReactNode }) => (
  <Dropdown triggerType="click" trigger={props.children}>
    <Menu
      onItemClick={(key: string) => props.onPick(key)}
      onClick={(event: React.MouseEvent) => event.stopPropagation()}
    >
      {props.items.map((item) => (
        <Menu.Item key={item.key} disabled={item.disabled}>
          <Translation>{item.label}</Translation>
          {item.note && (
            <span className="studio-add-note">
              <Translation>{item.note}</Translation>
            </span>
          )}
        </Menu.Item>
      ))}
    </Menu>
  </Dropdown>
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
  // afterItems are what can follow a step: in its own list, so no group inside a
  // group, and a branch only where steps run in parallel.
  const afterItems: AddItem[] = [
    { key: 'step', label: 'New step after' },
    ...(mode === 'DAG' ? [{ key: 'branch', label: 'New branch from here' }] : []),
    ...(group ? [] : [{ key: 'group', label: 'New group after' }]),
    { key: 'loop', label: 'New loop after', disabled: true, note: 'Coming soon' },
  ];
  const addAfter = (step: WorkflowStep) => (
    <AddMenu
      items={
        step.type === 'step-group' ? [{ key: 'inside', label: 'New step in this group' }, ...afterItems] : afterItems
      }
      onPick={(key) => {
        if (key === 'inside') {
          onAdd({ kind: 'step', group: step.name });
        } else if (key !== 'loop') {
          onAdd({ kind: key === 'group' ? 'group' : 'step', group, after: step.name, branch: key === 'branch' });
        }
      }}
    >
      <button
        type="button"
        className="studio-step-add"
        title={i18n.t('Add').toString()}
        onClick={(event) => event.stopPropagation()}
      >
        <BsPlusLg />
      </button>
    </AddMenu>
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
                    <span className="studio-step-tools">
                      {addAfter(step)}
                      {menu(step, index)}
                    </span>
                  </div>
                )}
                <div className="studio-step-head">
                  <div className="step-name" title={label(step)}>
                    {label(step)}
                  </div>
                  {!isGroup && (
                    <span className="studio-step-tools">
                      {addAfter(step)}
                      {menu(step, index)}
                    </span>
                  )}
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
      </div>
      <AddMenu
        items={[
          { key: 'step', label: 'New step' },
          ...(group ? [] : [{ key: 'group', label: 'New group' }]),
          { key: 'loop', label: 'New loop', disabled: true, note: 'Coming soon' },
        ]}
        onPick={(key) => key !== 'loop' && onAdd({ kind: key === 'group' ? 'group' : 'step', group })}
      >
        <button type="button" className="studio-add-step" onClick={(event) => event.stopPropagation()}>
          <BsPlusLg />
          <Translation>{group ? 'Add to this group' : 'Add'}</Translation>
        </button>
      </AddMenu>
    </div>
  );
};
