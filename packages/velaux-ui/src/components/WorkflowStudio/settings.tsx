import { Button, Checkbox, Field, Form, Input, Select } from '@alifd/next';
import React from 'react';

import type { WorkflowMode } from '@velaux/data';

import i18n from '../../i18n';
import { locale } from '../../utils/locale';
import DrawerWithFooter from '../Drawer';
import { Translation } from '../Translation';

// WorkflowSettings are a workflow's own fields, apart from its steps.
export type WorkflowSettings = {
  name: string;
  alias?: string;
  description?: string;
  mode: WorkflowMode;
  subMode: WorkflowMode;
  default?: boolean;
};

const modeOptions = () => [
  { value: 'StepByStep', label: i18n.t('In order').toString(), title: 'StepByStep' },
  { value: 'DAG', label: i18n.t('In parallel').toString(), title: 'DAG' },
];

const modeLabel = (mode: WorkflowMode) => (mode === 'DAG' ? 'In parallel' : 'In order');

// settingsSummary is the toolbar's one-line account of how a workflow runs.
export const SettingsSummary = (props: { mode: WorkflowMode; subMode: WorkflowMode }) => (
  <span className="studio-settings-summary">
    <Translation>{modeLabel(props.mode)}</Translation>
    <span className="studio-settings-sep">·</span>
    <Translation>groups</Translation> <Translation>{modeLabel(props.subMode).toLowerCase()}</Translation>
  </span>
);

type Props = {
  settings: WorkflowSettings;
  // withDefault offers whether the workflow is its environment's default; a
  // pipeline has none.
  withDefault?: boolean;
  onApply: (settings: WorkflowSettings) => void;
  onClose: () => void;
};

// WorkflowSettingsPanel edits a workflow's own fields. Apply hands them back to
// the studio as unsaved changes; the studio's Save stores them with the steps.
export class WorkflowSettingsPanel extends React.Component<Props> {
  field = new Field(this);

  componentDidMount() {
    this.field.setValues(this.props.settings);
  }

  apply = () => {
    this.field.validate((error, values: any) => {
      if (!error) {
        this.props.onApply({ ...this.props.settings, ...values });
      }
    });
  };

  render() {
    const { init } = this.field;
    const { settings, withDefault, onClose } = this.props;
    return (
      <DrawerWithFooter
        title={<Translation>Workflow settings</Translation>}
        placement="right"
        width={560}
        onClose={onClose}
        onOk={this.apply}
        onOkButtonText="Apply"
        extButtons={[
          <Button key="cancel" style={{ marginRight: '16px' }} onClick={onClose}>
            <Translation>Cancel</Translation>
          </Button>,
        ]}
      >
        <Form field={this.field} labelAlign="top" className="studio-settings">
          <Form.Item label={<Translation>Name</Translation>}>
            <Input value={settings.name} disabled />
          </Form.Item>
          <Form.Item label={<Translation>Alias</Translation>}>
            <Input
              name="alias"
              {...init('alias', {
                rules: [{ minLength: 2, maxLength: 64, message: 'Enter a string of 2 to 64 characters.' }],
              })}
            />
          </Form.Item>
          <Form.Item label={<Translation>Description</Translation>}>
            <Input.TextArea
              name="description"
              rows={3}
              {...init('description', {
                rules: [{ maxLength: 256, message: 'Enter a description that contains less than 256 characters.' }],
              })}
            />
          </Form.Item>
          <Form.Item
            label={<Translation>Steps run</Translation>}
            help={i18n
              .t(
                'In order, each step waits for the one before it; in parallel, each starts once what it depends on is done.'
              )
              .toString()}
          >
            <Select locale={locale().Select} dataSource={modeOptions()} {...init('mode')} />
          </Form.Item>
          <Form.Item
            label={<Translation>Steps in groups run</Translation>}
            help={i18n.t('For a group that does not choose its own.').toString()}
          >
            <Select locale={locale().Select} dataSource={modeOptions()} {...init('subMode')} />
          </Form.Item>
          {withDefault && (
            <Form.Item>
              <Checkbox
                checked={!!this.field.getValue('default')}
                onChange={(checked: boolean) => this.field.setValue('default', checked)}
              >
                <Translation>Default workflow for this environment</Translation>
              </Checkbox>
            </Form.Item>
          )}
        </Form>
      </DrawerWithFooter>
    );
  }
}
