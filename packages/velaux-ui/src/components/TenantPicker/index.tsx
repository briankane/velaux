import { Select } from '@alifd/next';
import { connect } from 'dva';
import React, { useEffect } from 'react';
import { AiOutlineAppstore } from 'react-icons/ai';

import type { LoginUserInfo } from '@velaux/data';
import i18n from '../../i18n';
import { locale } from '../../utils/locale';
import { allTenants, askedTenant, resolveTenant, seesAllTenants } from '../../utils/tenant';
import './index.less';

type Props = {
  userInfo?: LoginUserInfo;
  current: string;
  resolved: boolean;
  dispatch: (action: any) => void;
};

// TenantPicker sets the tenant every view is scoped to, from those the user may open.
const TenantPickerView = (props: Props) => {
  const { userInfo, current, resolved, dispatch } = props;
  const projects = userInfo?.projects || [];
  const all = seesAllTenants(userInfo);

  useEffect(() => {
    if (!userInfo?.name) {
      return;
    }
    const want = resolved ? current : askedTenant();
    const tenant = resolveTenant(
      want,
      projects.map((p) => p.name),
      all
    );
    if (!resolved || tenant !== current) {
      dispatch({ type: 'tenant/setTenant', payload: tenant });
    }
  }, [userInfo?.name, projects.length]);

  if (!userInfo?.name || projects.length === 0) {
    return null;
  }
  const options = [
    ...(all ? [{ label: i18n.t('All tenants').toString(), value: allTenants }] : []),
    ...projects.map((p) => ({ label: p.alias || p.name, value: p.name })),
  ];
  return (
    <Select
      className="tenant-picker"
      label={<AiOutlineAppstore className="tenant-picker-icon" />}
      value={current}
      dataSource={options}
      locale={locale().Select}
      autoWidth={false}
      onChange={(value: string) => dispatch({ type: 'tenant/setTenant', payload: value || allTenants })}
      aria-label={i18n.t('Tenant').toString()}
    />
  );
};

export const TenantPicker = connect((store: any) => ({
  userInfo: store.user.userInfo,
  current: store.tenant.current,
  resolved: store.tenant.resolved,
}))(TenantPickerView);
