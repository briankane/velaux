import React, { Component } from 'react';
import './index.less';
import { Button, Dialog, Dropdown, Menu } from '@alifd/next';
import axios from 'axios';
import { connect } from 'dva';
import { Link, routerRedux } from 'dva/router';
import {
  AiOutlineCode,
  AiOutlineMenuFold,
  AiOutlineMenuUnfold,
  AiOutlineQuestionCircle,
  AiOutlineSetting,
} from 'react-icons/ai';

import logo from '../../assets/kubevela-logo-white.png';
import logoMark from '../../assets/KubeVela-01.svg';
import { If } from '../../components/If';
import Permission from '../../components/Permission';
import SwitchLanguage from '../../components/SwitchButton/index';
import { Translation } from '../../components/Translation';
import i18n from '../../i18n';
import type { AddonBaseStatus, Config, SystemInfo, LoginUserInfo } from '@velaux/data';
import { getData, setData } from '../../utils/cache';
import { locale } from '../../utils/locale';
import { getBrowserNameAndVersion } from '../../utils/utils';
import CloudShell from '../CloudShell';

import { LayoutMode, Workspace } from '@velaux/data';
import { Dispatch } from 'redux';
import { menuService } from '../../services/MenuService';
import classNames from 'classnames';

type Props = {
  dispatch: Dispatch;
  mode: LayoutMode;
  userInfo?: LoginUserInfo;
  systemInfo?: SystemInfo;
  show?: boolean;
  enabledAddons?: AddonBaseStatus[];
  currentWorkspace?: Workspace;
  // collapsed minimises the sidebar to its icons.
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  children?: React.ReactNode;
};

type State = {
  platformSetting: boolean;
  grafanaConfigs?: Config[];
  workspaces: Workspace[];
};

const TelemetryDataCollectionKey = 'telemetryDataCollection';
const TelemetryDataCollectionServer = 'https://telemetry.kubevela.net/collecting';
@connect((store: any) => {
  return { ...store.user, ...store.cloudshell, ...store.addons };
})
class Header extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      platformSetting: false,
      workspaces: [],
    };
  }

  componentDidMount() {
    this.loadSystemInfo();
    this.loadUserInfo();
    this.loadEnabledAddons();
  }

  loadWorkspaces = () => {
    const { userInfo } = this.props;
    menuService.loadPluginMenus().then(() => {
      this.setState({
        workspaces: menuService.loadWorkspaces(userInfo),
      });
    });
  };

  loadSystemInfo = () => {
    this.props.dispatch({
      type: 'user/getSystemInfo',
      callback: () => {
        this.telemetryDataCollection();
      },
    });
  };

  loadEnabledAddons = () => {
    this.props.dispatch({
      type: 'addons/getEnabledAddons',
      payload: {},
    });
  };

  telemetryDataCollection = async () => {
    const { systemInfo } = this.props;
    if (!getData(TelemetryDataCollectionKey) && systemInfo?.enableCollection) {
      try {
        axios
          .post(TelemetryDataCollectionServer, this.buildTelemetryData())
          .catch()
          .then(() => {
            this.setCache();
          });
      } catch {}
    }
  };

  buildTelemetryData = () => {
    const { systemInfo } = this.props;
    return {
      platformID: systemInfo?.platformID,
      installTime: systemInfo?.installTime,
      version: (systemInfo?.systemVersion?.velaVersion || '') + +'/' + (systemInfo?.systemVersion?.gitVersion || ''),
      clusterCount: systemInfo?.statisticInfo.clusterCount || '',
      appCount: systemInfo?.statisticInfo.appCount || '',
      enableAddonList: systemInfo?.statisticInfo.enableAddonList || {},
      componentDefinitionTopList: systemInfo?.statisticInfo.componentDefinitionTopList,
      traitDefinitionTopList: systemInfo?.statisticInfo.traitDefinitionTopList,
      workflowStepDefinitionTopList: systemInfo?.statisticInfo.workflowDefinitionTopList,
      policyDefinitionTopList: systemInfo?.statisticInfo.policyDefinitionTopList,
      browserInfo: {
        language: navigator.language,
        nameAndVersion: getBrowserNameAndVersion(),
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
      },
    };
  };

  setCache = () => {
    const now = new Date();
    now.setHours(now.getHours() + 24);
    setData(TelemetryDataCollectionKey, 'true', now);
  };

  loadUserInfo = () => {
    this.props.dispatch({
      type: 'user/getLoginUserInfo',
      callback: () => {
        this.loadWorkspaces();
      },
    });
  };

  onLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    this.props.dispatch(
      routerRedux.push({
        pathname: '/login',
      })
    );
  };

  checkEnabledAddon = (addonName: string) => {
    const { enabledAddons } = this.props;
    if (!enabledAddons) {
      return false;
    }
    const addonNames = enabledAddons.map((addon) => {
      return addon.name;
    });
    if (addonNames.includes(addonName)) {
      return true;
    }
    return false;
  };

  onOpenCloudShell = () => {
    if (!this.checkEnabledAddon('cloudshell')) {
      Dialog.alert({
        title: i18n.t('CloudShell feature is not enabled').toString(),
        content: i18n.t('You must enable the CloudShell addon').toString(),
        locale: locale().Dialog,
        footer: (
          <Button
            type="secondary"
            onClick={() => {
              this.props.dispatch(
                routerRedux.push({
                  pathname: '/addons/cloudshell',
                })
              );
            }}
          >
            <Translation>Go to enable</Translation>
          </Button>
        ),
      });
      return;
    }
    this.props.dispatch({
      type: 'cloudshell/open',
    });
  };

  render() {
    const { show, userInfo, currentWorkspace, children, onToggleCollapsed } = this.props;
    // The admin dashboard is linked on its own; its pages join the sidebar
    // while it is open.
    const admin = this.state.workspaces.find((ws) => ws.name === 'admin');
    const collapsed = !!this.props.collapsed;
    const userName = userInfo?.alias ? userInfo.alias : userInfo?.name;

    return (
      <div className={classNames('layout-sidebar', { collapsed })}>
        <div className="sidebar-brand">
          <Link to="/" className="sidebar-logo" title={'Make shipping applications more enjoyable.'}>
            <img src={collapsed ? logoMark : logo} />
          </Link>
          <div
            className="sidebar-collapse"
            title={i18n.t(collapsed ? 'Expand' : 'Minimise').toString()}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <AiOutlineMenuUnfold size={18} /> : <AiOutlineMenuFold size={18} />}
          </div>
        </div>

        <div className="sidebar-menu">{children}</div>

        <div className="sidebar-footer">
          <Permission request={{ resource: 'cloudshell', action: 'create' }}>
            <div className="sidebar-footer-item" title="Open Cloud Shell" onClick={this.onOpenCloudShell}>
              <AiOutlineCode size={18} />
              {!collapsed && (
                <span>
                  <Translation>Cloud Shell</Translation>
                </span>
              )}
            </div>
          </Permission>
          {admin && (
            <Link
              to={admin.rootRoute}
              className={classNames('sidebar-footer-item', { active: currentWorkspace?.name === admin.name })}
              title={i18n.t(admin.label || admin.name).toString()}
            >
              {admin.icon}
              {!collapsed && (
                <span>
                  <Translation>{admin.label || admin.name}</Translation>
                </span>
              )}
            </Link>
          )}
          <Permission request={{ resource: 'systemSetting', action: 'update' }}>
            <Link to="/settings" className="sidebar-footer-item" title={i18n.t('Platform Settings').toString()}>
              <AiOutlineSetting size={18} />
              {!collapsed && (
                <span>
                  <Translation>Settings</Translation>
                </span>
              )}
            </Link>
          </Permission>
          <a
            className="sidebar-footer-item"
            title="KubeVela Documents"
            href="https://kubevela.io"
            target="_blank"
            rel="noopener noreferrer"
          >
            <AiOutlineQuestionCircle size={18} />
            {!collapsed && (
              <span>
                <Translation>Documentation</Translation>
              </span>
            )}
          </a>
          <div className="sidebar-footer-item sidebar-language">
            <SwitchLanguage />
            {!collapsed && (
              <span>
                <Translation>Language</Translation>
              </span>
            )}
          </div>
          <If condition={userInfo}>
            <Dropdown
              align="bl tl"
              trigger={
                <div className="sidebar-user" title={userName}>
                  <span className="sidebar-avatar">{(userName || '?').slice(0, 1).toUpperCase()}</span>
                  {!collapsed && <span className="sidebar-user-name">{userName}</span>}
                </div>
              }
            >
              <Menu>
                <Menu.Item onClick={this.onLogout}>
                  <Translation>Logout</Translation>
                </Menu.Item>
              </Menu>
            </Dropdown>
          </If>
        </div>
        <If condition={show}>
          <CloudShell />
        </If>
      </div>
    );
  }
}

export default Header;
