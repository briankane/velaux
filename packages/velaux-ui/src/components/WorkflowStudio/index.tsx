import classNames from 'classnames';
import { connect } from 'dva';
import _ from 'lodash';
import React from 'react';
import Draggable from 'react-draggable';
import type { Dispatch } from 'redux';

import { WorkflowEditContext } from '../../context';
import type { DefinitionBase, WorkflowMode, WorkflowStep, WorkflowStepBase } from '@velaux/data';

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
    if (prevProps.steps != this.props.steps) {
      this.setState({ steps: _.cloneDeep(this.props.steps || []) });
    }
  }

  onChange = () => {
    this.props.onChange(this.state.steps);
  };

  checkStepName = (name: string) =>
    this.state.steps.some((step) => step.name === name || step.subSteps?.some((sub) => sub.name === name));

  addStep = (step: WorkflowStepBase) => {
    const { adding, steps } = this.state;
    if (!adding) {
      return;
    }
    const added = adding.dependsOn ? { ...step, dependsOn: adding.dependsOn } : step;
    const next = _.cloneDeep(steps);
    if (adding.group) {
      const group = next.find((s) => s.name === adding.group);
      if (group) {
        group.subSteps = group.subSteps || [];
        group.subSteps.splice(adding.index, 0, added);
      }
    } else {
      next.splice(adding.index, 0, added);
    }
    this.setState(
      {
        steps: next,
        adding: undefined,
        showStep: step.type != 'step-group' ? added : undefined,
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
    const steps = this.state.steps.map((s) => (s.name === group ? { ...s, mode } : s));
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
              />
            </div>
          </Draggable>
        </div>
        {adding && (
          <TypeSelect
            checkStepName={this.checkStepName}
            onClose={() => {
              this.setState({ adding: undefined });
            }}
            addSub={!!adding.group}
            addStep={this.addStep}
            definitions={definitions}
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
