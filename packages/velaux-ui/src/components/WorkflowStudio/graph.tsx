import { Dropdown, Menu, Select } from '@alifd/next';
import classNames from 'classnames';
import React from 'react';
import { BiGitBranch } from 'react-icons/bi';
import {
  BsArrowLeftShort,
  BsArrowRepeat,
  BsArrowRight,
  BsArrowRightShort,
  BsCollection,
  BsPlus,
  BsPlusLg,
  BsSquare,
  BsTrash3,
} from 'react-icons/bs';

import type { WorkflowMode, WorkflowStep, WorkflowStepBase } from '@velaux/data';

import i18n from '../../i18n';
import { locale } from '../../utils/locale';
import { canMove, forwardWaits, stepEdges } from '../PipelineGraph/dependencies';
import { StepEdges, stepWidth, useStepLayout } from '../PipelineGraph/layout';
import { Translation } from '../Translation';
import { addPreview } from './edit';
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

// StepTools are a card's moves (where steps run in order, each offered only
// where it keeps the step after what it waits on) and Delete, shown on hover.
const StepTools = (props: {
  onDelete: () => void;
  onMove?: (delta: -1 | 1) => void;
  earlier?: boolean;
  later?: boolean;
}) => {
  const tool = (title: string, icon: React.ReactNode, onClick: () => void, disabled?: boolean) => (
    <button
      type="button"
      className="studio-tool"
      title={i18n.t(title).toString()}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {icon}
    </button>
  );
  return (
    <span className="studio-step-tools">
      {props.onMove && tool('Move earlier', <BsArrowLeftShort />, () => props.onMove!(-1), !props.earlier)}
      {props.onMove && tool('Move later', <BsArrowRightShort />, () => props.onMove!(1), !props.later)}
      {tool('Delete', <BsTrash3 />, props.onDelete)}
    </span>
  );
};

type AddItem = { key: string; label: string; icon: React.ReactNode; disabled?: boolean; note?: string };

// AddMenu opens, on hover, the things that can be added from where it sits,
// beside its trigger and centred on it; clicking the trigger adds a step.
// preview, where given, draws what the hovered item would do beside the list.
const AddMenu = (props: {
  items: AddItem[];
  onPick: (key: string) => void;
  preview?: (key: string) => React.ReactNode;
  children: React.ReactNode;
}) => {
  const first = props.items.find((item) => !item.disabled)?.key || '';
  const [hovered, setHovered] = React.useState(first);
  return (
    <Dropdown
      triggerType="hover"
      delay={250}
      trigger={props.children}
      align="cl cr"
      offset={[12, 0]}
      animation={false}
      onVisibleChange={(visible: boolean) => visible && setHovered(first)}
    >
      <div className="studio-add-menu" onClick={(event: React.MouseEvent) => event.stopPropagation()}>
        <Menu onItemClick={(key: string) => props.onPick(key)}>
          {props.items.map((item) => (
            <Menu.Item key={item.key} disabled={item.disabled} onMouseEnter={() => setHovered(item.key)}>
              <span className="studio-add-icon">{item.icon}</span>
              <Translation>{item.label}</Translation>
              {item.note && (
                <span className="studio-add-note">
                  <Translation>{item.note}</Translation>
                </span>
              )}
            </Menu.Item>
          ))}
        </Menu>
        {props.preview && <div className="studio-add-preview">{props.preview(hovered)}</div>}
      </div>
    </Dropdown>
  );
};

// PreviewTree draws a small tree: root, then each node as a chip, a node's
// children nested under it; added marks the chip that would be new.
type PreviewNode = { label: string; added?: boolean; children?: PreviewNode[] };
const PreviewTree = (props: { root: string; nodes: PreviewNode[]; caption: string }) => {
  const shown = (nodes: PreviewNode[]) => {
    const limit = 4;
    const extra = nodes.length - limit;
    return (
      <ul className="pv-tree">
        {nodes.slice(0, limit).map((n) => (
          <li key={n.label}>
            <span className={classNames('pv-chip', { added: n.added })}>
              <Translation>{n.label}</Translation>
            </span>
            {n.children && n.children.length > 0 && shown(n.children)}
          </li>
        ))}
        {extra > 0 && (
          <li>
            <span className="pv-more">+{extra}</span>
          </li>
        )}
      </ul>
    );
  };
  return (
    <div className="pv">
      <span className="pv-chip root">{props.root}</span>
      {shown(props.nodes)}
      <div className="pv-caption">
        <Translation>{props.caption}</Translation>
      </div>
    </div>
  );
};

// StudioGraph draws a workflow's steps for editing, laid out by what they wait
// on as a run is. Each card adds after it inline or as a branch; clicking a
// card edits it, and hovering a card shows its moves and Delete. A group holds
// its own steps the same way, in its own mode.
export const StudioGraph = (props: StudioGraphProps) => {
  const { steps, mode, subMode, group, onAdd, onEdit, onDelete, onGroupMode, onMove, onResize } = props;
  const [, setNestedResizes] = React.useState(0);
  const nestedResized = React.useCallback(() => setNestedResizes((n) => n + 1), []);
  const edges = stepEdges(steps, steps, mode);
  // In order, a step waiting on a later one would wait for ever.
  const forward = mode === 'StepByStep' ? forwardWaits(steps) : [];
  const isForward = (from: string, to: string) => forward.some((f) => f.step === to && f.waitsOn === from);
  const tools = (step: WorkflowStep, index: number) => (
    <StepTools
      onDelete={() => onDelete(step.name, group)}
      onMove={mode === 'StepByStep' ? (delta) => onMove(step.name, group, delta) : undefined}
      earlier={canMove(steps, index, -1)}
      later={canMove(steps, index, 1)}
    />
  );
  // addItems are what can be added: no group inside a group, and no loop yet.
  const addItems: AddItem[] = [
    { key: 'step', label: 'Step', icon: <BsSquare /> },
    { key: 'group', label: 'Group', icon: <BsCollection />, disabled: !!group },
    { key: 'loop', label: 'Loop', icon: <BsArrowRepeat />, disabled: true, note: 'Soon' },
  ];
  const labelOf = (name: string) => label(steps.find((x) => x.name === name) || { name });
  // previewAfter draws what adding the hovered item after step would do,
  // inline or as a branch.
  const previewAfter = (step: WorkflowStep, key: string, branch: boolean) => {
    if (key === 'loop') {
      return <div className="pv-caption">{i18n.t('Loops are coming soon').toString()}</div>;
    }
    const { moved, stay } = addPreview(steps, step.name, branch ? 'branch' : 'step', mode);
    const added: PreviewNode = {
      label: key === 'group' ? 'New group' : 'New step',
      added: true,
      children: moved.map((n) => ({ label: labelOf(n) })),
    };
    const kept = stay.map((n) => ({ label: labelOf(n) }));
    return (
      <PreviewTree
        root={label(step)}
        nodes={branch ? [...kept, added] : [added, ...kept]}
        caption={
          branch
            ? 'Runs alongside, nothing waits on it'
            : moved.length > 0
            ? 'Runs before what followed'
            : 'Runs after this step'
        }
      />
    );
  };
  // addPair is a card's two ways to add after it, joined by a +: inline, in
  // the middle of what follows, and as a branch beside it (in parallel only).
  // Clicking one adds a step that way; hovering offers a step, group or loop.
  const addPair = (step: WorkflowStep) => {
    const half = (branch: boolean) => {
      const off = branch && mode !== 'DAG';
      const button = (
        <button
          type="button"
          className={classNames('studio-add-half', branch ? 'branch' : 'inline')}
          disabled={off}
          title={i18n
            .t(off ? 'Branches need steps to run in parallel' : branch ? 'Add a branch' : 'Add inline')
            .toString()}
          onClick={(event) => {
            event.stopPropagation();
            onAdd({ kind: 'step', group, after: step.name, branch });
          }}
        >
          {branch ? <BiGitBranch /> : <BsArrowRight />}
        </button>
      );
      return off ? (
        button
      ) : (
        <AddMenu
          preview={(key) => previewAfter(step, key, branch)}
          items={addItems}
          onPick={(key) =>
            key !== 'loop' && onAdd({ kind: key === 'group' ? 'group' : 'step', group, after: step.name, branch })
          }
        >
          {button}
        </AddMenu>
      );
    };
    return (
      <span className="studio-add-pair" onClick={(event) => event.stopPropagation()}>
        {half(false)}
        <span className="studio-add-join">
          <BsPlus />
        </span>
        {half(true)}
      </span>
    );
  };
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
                    {tools(step, index)}
                  </div>
                )}
                <div className="studio-step-head">
                  <div className="step-name" title={label(step)}>
                    {label(step)}
                  </div>
                  {!isGroup && tools(step, index)}
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
              {addPair(step)}
            </div>
          );
        })}
      </div>
      <AddMenu
        items={addItems.filter((item) => item.key !== 'branch')}
        onPick={(key) => key !== 'loop' && onAdd({ kind: key === 'group' ? 'group' : 'step', group })}
      >
        <button
          type="button"
          className="studio-add-step"
          onClick={(event) => {
            event.stopPropagation();
            onAdd({ kind: 'step', group });
          }}
        >
          <BsPlusLg />
          <Translation>{group ? 'Add to this group' : 'Add'}</Translation>
        </button>
      </AddMenu>
    </div>
  );
};
