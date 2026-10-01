import React from 'react';

import i18n from '../../i18n';
import { flattenProperties } from './properties';
import './index.less';

export { flattenProperties } from './properties';

// PropertyList lists properties by path, as an expanded row shows them.
export const PropertyList = (props: { properties: unknown }) => (
  <dl className="row-list-properties">
    {flattenProperties(props.properties).map((p) => (
      <React.Fragment key={p.key}>
        <dt>{p.key}</dt>
        <dd title={p.value}>{p.value}</dd>
      </React.Fragment>
    ))}
  </dl>
);

// RowAction is one of a row's actions, as an icon button named by its tooltip.
export const RowAction = (props: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => {
  const label = i18n.t(props.label).toString();
  return (
    <button
      type="button"
      className={`row-list-action ${props.danger ? 'danger' : ''}`}
      title={label}
      aria-label={label}
      onClick={props.onClick}
    >
      {props.icon}
    </button>
  );
};
