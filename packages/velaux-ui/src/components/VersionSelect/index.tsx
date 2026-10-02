import { Select } from '@alifd/next';
import React, { useEffect, useState } from 'react';

import { listDefinitionRevisions } from '../../api/definitions';
import i18n from '../../i18n';
import { momentDate } from '../../utils/common';
import type { DefinitionRevision } from '../../utils/definitionVersion';
import { versionLabel } from '../../utils/definitionVersion';
import { locale } from '../../utils/locale';
import { Translation } from '../Translation';
import './index.less';

type Props = {
  // definitionType is component, trait, policy or source.
  definitionType: string;
  // name is the definition chosen; there is no version to pick without one.
  name?: string;
  // value is the version pinned, or none to follow the latest.
  value?: string;
  onChange: (version?: string) => void;
  disabled?: boolean;
};

// latest is the select's value for following the definition's latest version.
const latest = '';

// VersionSelect picks the version of a definition a type is pinned to. Pinning
// is optional but recommended: a type that follows the latest changes when
// the definition does.
export const VersionSelect = (props: Props) => {
  const { definitionType, name, value, onChange, disabled } = props;
  const [revisions, setRevisions] = useState<DefinitionRevision[]>([]);

  useEffect(() => {
    if (!name) {
      setRevisions([]);
      return;
    }
    listDefinitionRevisions({ name, type: definitionType }).then((res: any) => {
      setRevisions(res?.revisions || []);
    });
  }, [name, definitionType]);

  const newest = revisions[0];
  const options = [
    {
      value: latest,
      label: newest
        ? i18n.t('Latest, follows updates (now {{version}})', { version: versionLabel(newest) }).toString()
        : i18n.t('Latest, follows updates').toString(),
    },
    ...revisions.map((r) => ({
      value: r.version,
      label: `${versionLabel(r)} · ${momentDate(r.createTime)}`,
    })),
  ];
  return (
    <div className="version-select">
      <Select
        value={value || latest}
        dataSource={options}
        disabled={disabled || !name}
        locale={locale().Select}
        onChange={(v: string) => onChange(v || undefined)}
        aria-label={i18n.t('Version').toString()}
      />
      {name && !value && (
        <div className="version-select-hint">
          <Translation>
            Pinning a version is recommended, so changes to the definition reach this only when you choose.
          </Translation>
        </div>
      )}
    </div>
  );
};
