import React from 'react';
import Draggable from 'react-draggable';

import type { WorkflowStepStatus } from '@velaux/data';

import './index.less';
import { Step } from './components/step';
import { stepReached } from './status';

type PipelineGraphProps = {
  name?: string;
  steps?: WorkflowStepStatus[];
  zoom: number;
  // selected is the id of the step whose details are open.
  selected?: string;
  onApprove?: (step: WorkflowStepStatus) => void;
  approving?: string;
  onNodeClick: (step: WorkflowStepStatus) => void;
};

type State = {
  stepWidth: number;
  stepInterval: number;
};

class PipelineGraph extends React.Component<PipelineGraphProps, State> {
  constructor(props: PipelineGraphProps) {
    super(props);
    this.state = {
      stepWidth: 270,
      stepInterval: 48,
    };
  }

  renderConnector(index: number, total: number, from: string, to: string, reached: boolean) {
    const { stepInterval, stepWidth } = this.state;
    const startPoint = stepWidth + (index - 1) * (stepWidth + stepInterval);
    const endPoint = startPoint + stepInterval;
    const width = (stepInterval + stepWidth) * total;
    return (
      <svg key={from + to} className="workflow-connectors" width={width} height={300}>
        <path
          className={reached ? 'workflow-connector reached' : 'workflow-connector'}
          data-from={'step-' + from}
          data-to={'step-' + to}
          fill="none"
          d={`M ${startPoint} 30 H ${endPoint}`}
        />
      </svg>
    );
  }

  render() {
    const { steps, zoom, name, selected, onApprove, approving } = this.props;
    return (
      <Draggable>
        <div
          className="workflow-graph"
          style={{
            transform: `scale(${zoom})`,
          }}
        >
          {steps &&
            steps.length > 1 &&
            steps.map((step, i: number) => {
              if (i < steps.length - 1) {
                return this.renderConnector(i + 1, steps.length, step.id, steps[i + 1].id, stepReached(steps[i + 1]));
              }
              return;
            })}
          {steps &&
            steps.map((step, i: number) => {
              return (
                <Step
                  key={name + step.name}
                  probeState={this.state}
                  step={step}
                  group={step.type == 'step-group'}
                  selected={selected}
                  onApprove={onApprove}
                  approving={approving}
                  output={i < steps.length - 1}
                  input={i !== 0}
                  onNodeClick={this.props.onNodeClick}
                />
              );
            })}
        </div>
      </Draggable>
    );
  }
}

export default PipelineGraph;
