import classNames from 'classnames';
import { connect } from 'dva';
import _ from 'lodash';
import React from 'react';
import Draggable from 'react-draggable';
import type { Dispatch } from 'redux';

import { WorkflowEditContext } from '../../context';
import type { DefinitionBase, WorkflowMode, WorkflowStep, WorkflowStepBase } from '@velaux/data';

import { groupMode, orderByDependencies } from '../PipelineGraph/dependencies';
import { insertAfter } from './edit';
import type { AddAt } from './graph';
import { StudioGraph } from './graph';
import StepForm from './step-form';
import TypeSelect from './type-select';

import './index.less';

type Props = {
  steps?: WorkflowStep[];
  mode?: WorkflowMode;
  subMode?: WorkflowMode;
  definitions?: DefinitionBase[];
  dispatch?: Dispatch<any>;
  onChange: (steps: WorkflowStep[]) => void;
};
type State = {
  steps: WorkflowStep[];
  // adding is where the step being picked will go.
  adding?: AddAt;
  // showStep is the step whose form is open; showGroup the group it is in.
  showStep?: WorkflowStepBase;
  showGroup?: string;
};

// withoutDependency drops a removed step from its siblings' dependsOn, so none
// waits on a step that is gone.
const withoutDependency = <T extends WorkflowStepBase>(steps: T[], name: string): T[] =>
  steps.map((s) => (s.dependsOn?.includes(name) ? { ...s, dependsOn: s.dependsOn.filter((d) => d !== name) } : s));

@connect()
class WorkflowStudio extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { steps: _.cloneDeep(props.steps || []) };
  }

  componentDidUpdate(prevProps: Readonly<Props>) {
    const toOrder = (from?: WorkflowMode, to?: WorkflowMode) => from !== 'StepByStep' && to === 'StepByStep';
    const ordersTop = toOrder(prevProps.mode, this.props.mode);
    const ordersGroups = toOrder(prevProps.subMode, this.props.subMode);
    if (prevProps.steps != this.props.steps && !ordersTop && !ordersGroups) {
      this.setState({ steps: _.cloneDeep(this.props.steps || []) });
      return;
    }
    if (ordersTop || ordersGroups) {
      // Steps switched to run in order are ordered so none waits on a later one.
      let steps = ordersTop ? orderByDependencies(this.state.steps) : this.state.steps;
      if (ordersGroups) {
        steps = steps.map((s) =>
          s.type === 'step-group' && !s.mode ? { ...s, subSteps: orderByDependencies(s.subSteps || []) } : s
        );
      }
      if (!_.isEqual(steps, this.state.steps)) {
        this.setState({ steps }, this.onChange);
      }
    }
  }

  onChange = () => {
    this.props.onChange(this.state.steps);
  };

  checkStepName = (name: string) =>
    this.state.steps.some((step) => step.name === name || step.subSteps?.some((sub) => sub.name === name));

  addStep = (step: WorkflowStepBase) => {
    const { adding, steps } = this.state;
    const { mode = 'StepByStep', subMode = 'DAG' } = this.props;
    if (!adding) {
      return;
    }
    const opts = { branch: !!adding.branch };
    let added: WorkflowStepBase = step;
    let next: WorkflowStep[];
    if (adding.group) {
      next = steps.map((s) => {
        if (s.name !== adding.group) {
          return s;
        }
        const subSteps = insertAfter(s.subSteps || [], adding.after, step, {
          ...opts,
          mode: groupMode(s.mode, undefined, subMode),
        });
        added = subSteps.find((sub) => sub.name === step.name) || step;
        return { ...s, subSteps };
      });
    } else {
      next = insertAfter(steps, adding.after, step as WorkflowStep, { ...opts, mode });
      added = next.find((s) => s.name === step.name) || step;
    }
    // A new group goes straight on to its first step; a new step to its form.
    const group = step.type == 'step-group';
    this.setState(
      {
        steps: next,
        adding: group ? { kind: 'step', group: step.name } : undefined,
        showStep: group ? undefined : added,
        showGroup: adding.group,
      },
      this.onChange
    );
  };

  onUpdateStep = (step: WorkflowStepBase) => {
    const { showGroup } = this.state;
    const steps = this.state.steps.map((s) => {
      if (!showGroup && s.name === step.name) {
        return { ...s, ...step };
      }
      if (showGroup && s.name === showGroup) {
        return { ...s, subSteps: s.subSteps?.map((sub) => (sub.name === step.name ? { ...step } : sub)) };
      }
      return s;
    });
    this.setState({ steps, showStep: undefined, showGroup: undefined }, this.onChange);
  };

  onDeleteStep = (name: string, group?: string) => {
    const steps = group
      ? this.state.steps.map((s) =>
          s.name === group
            ? {
                ...s,
                subSteps: withoutDependency(
                  (s.subSteps || []).filter((sub) => sub.name !== name),
                  name
                ),
              }
            : s
        )
      : withoutDependency(
          this.state.steps.filter((s) => s.name !== name),
          name
        );
    this.setState({ steps }, this.onChange);
  };

  onGroupMode = (group: string, mode: WorkflowMode) => {
    const steps = this.state.steps.map((s) =>
      s.name === group
        ? { ...s, mode, subSteps: mode === 'StepByStep' ? orderByDependencies(s.subSteps || []) : s.subSteps }
        : s
    );
    this.setState({ steps }, this.onChange);
  };

  onMove = (name: string, group: string | undefined, delta: -1 | 1) => {
    const swap = <T extends { name: string }>(list: T[]): T[] => {
      const i = list.findIndex((s) => s.name === name);
      const next = [...list];
      [next[i], next[i + delta]] = [next[i + delta], next[i]];
      return next;
    };
    const steps = group
      ? this.state.steps.map((s) => (s.name === group ? { ...s, subSteps: swap(s.subSteps || []) } : s))
      : swap(this.state.steps);
    this.setState({ steps }, this.onChange);
  };

  render() {
    const { steps, adding, showStep, showGroup } = this.state;
    const { definitions, mode = 'StepByStep', subMode = 'DAG' } = this.props;
    return (
      <div className={classNames('run-studio', 'studio-editor')}>
        <div className="studio">
          <Draggable cancel=".studio-step, .studio-add, .studio-add-step">
            <div className="run-canvas">
              <StudioGraph
                steps={steps}
                mode={mode}
                subMode={subMode}
                onAdd={(at) => this.setState({ adding: at })}
                onEdit={(step, group) => this.setState({ showStep: step, showGroup: group })}
                onDelete={this.onDeleteStep}
                onGroupMode={this.onGroupMode}
                onMove={this.onMove}
              />
            </div>
          </Draggable>
        </div>
        {adding && (
          <TypeSelect
            key={JSON.stringify(adding)}
            checkStepName={this.checkStepName}
            onClose={() => {
              this.setState({ adding: undefined });
            }}
            addSub={!!adding.group}
            addStep={this.addStep}
            definitions={definitions?.filter((d) => (adding.kind === 'group') === (d.name === 'step-group'))}
          />
        )}
        {showStep && (
          <WorkflowEditContext.Provider value={{ stepName: showStep.name, steps: steps }}>
            <StepForm
              onClose={() => {
                this.setState({ showStep: undefined, showGroup: undefined });
              }}
              isSubStep={!!showGroup}
              onUpdate={this.onUpdateStep}
              step={showStep}
            />
          </WorkflowEditContext.Provider>
        )}
      </div>
    );
  }
}

export default WorkflowStudio;
