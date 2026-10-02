import { Button, Checkbox, Dialog, Field, Form, Input, Message, Radio, Switch } from '@alifd/next';
import React, { useState } from 'react';

import type { DefKitModule, DefKitSettings } from '@velaux/data';
import { createDefKitModule, updateDefKitModule } from '../../api/defkit';
import { Translation } from '../../components/Translation';
import i18n from '../../i18n';
import { parseSource } from './defkit';

const typeOptions = [
  { value: 'component', label: 'Components' },
  { value: 'trait', label: 'Traits' },
  { value: 'policy', label: 'Policies' },
  { value: 'workflow-step', label: 'Workflow steps' },
];

// ModuleDialog adds a module, or with `module` changes its source or options.
// Either way the module renders and waits for review.
export const ModuleDialog = (props: { module?: DefKitModule; onClose: () => void; onDone: (name: string) => void }) => {
  const { module } = props;
  const src = module?.source;
  const field = Field.useField({
    values: {
      name: module?.name || '',
      from: src?.git || src?.ref || '',
      version: src?.version || '',
      prefix: src?.prefix || '',
      types: src?.types || [],
      deletionPolicy: module?.settings.deletionPolicy || 'retain',
      autoUpdate: !!module?.settings.autoUpdate,
      interval: module?.settings.interval || '10m',
    },
  });
  const [saving, setSaving] = useState(false);
  const submit = () => {
    field.validate((errors: any, values: any) => {
      if (errors) {
        return;
      }
      const source = parseSource(values.from, values.version, values.prefix, values.types || []);
      const settings: DefKitSettings = {
        deletionPolicy: values.deletionPolicy,
        overrides: module?.settings.overrides,
        autoUpdate: values.autoUpdate,
        interval: values.autoUpdate ? values.interval.trim() : undefined,
      };
      setSaving(true);
      const call = module
        ? updateDefKitModule(module.name, source, settings)
        : createDefKitModule(values.name, source, settings);
      call
        .then((res: any) => {
          if (res) {
            Message.success(
              i18n
                .t(values.autoUpdate ? 'Rendering the module; it applies when ready' : 'Rendering the module; review it when it is ready')
                .toString()
            );
            props.onDone(module ? module.name : values.name);
          }
        })
        .finally(() => setSaving(false));
    });
  };
  const { init } = field;
  return (
    <Dialog
      v2
      visible
      width={640}
      title={<Translation>{module ? 'Update DefKit module' : 'Add DefKit module'}</Translation>}
      onClose={props.onClose}
      footer={
        <div className="defkit-dialog-footer">
          <Button onClick={props.onClose}>
            <Translation>Cancel</Translation>
          </Button>
          <Button type="primary" loading={saving} onClick={submit}>
            <Translation>Render and review</Translation>
          </Button>
        </div>
      }
    >
      <Form field={field} labelAlign="top" fullWidth>
        <Form.Item label={<Translation>Name</Translation>} required disabled={!!module}>
          <Input
            {...init('name', {
              rules: [
                { required: true, message: i18n.t('Give the module a name').toString() },
                {
                  pattern: /^[a-z0-9]([-a-z0-9]{0,40}[a-z0-9])?$/,
                  message: i18n.t('Lower case letters, digits and hyphens').toString(),
                },
              ],
            })}
            placeholder="vela-definitions"
          />
        </Form.Item>
        <Form.Item
          label={<Translation>Source</Translation>}
          required
          help={<Translation>A git repository URL, or a Go module path</Translation>}
        >
          <Input
            {...init('from', { rules: [{ required: true, message: i18n.t('Say where the module is').toString() }] })}
            placeholder="https://github.com/kubevela/vela-go-definitions"
          />
        </Form.Item>
        <Form.Item
          label={<Translation>Version</Translation>}
          help={<Translation>A branch, tag or commit for a repository; a module version otherwise. Latest when empty.</Translation>}
        >
          <Input {...init('version')} placeholder="main" />
        </Form.Item>
        <Form.Item label={<Translation>Name prefix</Translation>} help={<Translation>Added to every definition name</Translation>}>
          <Input {...init('prefix')} placeholder="my-" />
        </Form.Item>
        <Form.Item label={<Translation>Definition types</Translation>} help={<Translation>All when none is ticked</Translation>}>
          <Checkbox.Group
            {...init('types')}
            dataSource={typeOptions.map((o) => ({ value: o.value, label: i18n.t(o.label).toString() }))}
          />
        </Form.Item>
        <Form.Item
          label={<Translation>Deletion policy</Translation>}
          help={
            <Translation>
              Retain keeps a definition when the module drops it or is uninstalled. Delete removes it with them. A
              definition can override this.
            </Translation>
          }
        >
          <Radio.Group
            {...init('deletionPolicy')}
            dataSource={[
              { value: 'retain', label: i18n.t('Retain').toString() },
              { value: 'delete', label: i18n.t('Delete').toString() },
            ]}
          />
        </Form.Item>
        <Form.Item
          label={<Translation>Auto update</Translation>}
          help={<Translation>Render and apply on a schedule, without review. Definitions it does not own are never taken over.</Translation>}
        >
          <Switch {...init('autoUpdate', { valueName: 'checked' })} />
        </Form.Item>
        {field.getValue('autoUpdate') && (
          <Form.Item
            label={<Translation>Every</Translation>}
            required
            help={<Translation>A duration after each run, such as 10m or 1h</Translation>}
          >
            <Input
              {...init('interval', {
                rules: [
                  {
                    pattern: /^\s*([0-9]+(\.[0-9]+)?(h|m|s))+\s*$/,
                    message: i18n.t('A duration such as 10m or 1h').toString(),
                  },
                ],
              })}
              placeholder="10m"
            />
          </Form.Item>
        )}
      </Form>
    </Dialog>
  );
};
