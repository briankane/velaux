import React, { Component } from 'react';
import './index.less';
import { Button, Dialog, Dropdown } from '@alifd/next';
import axios from 'axios';
import { connect } from 'dva';
import { Link, routerRedux } from 'dva/router';
import {
  AiOutlineCode,
  AiOutlineLogout,
  AiOutlineMenuFold,
  AiOutlineMenuUnfold,
  AiOutlineQuestionCircle,
  AiOutlineSetting,
} from 'react-icons/ai';

import logo from '../../assets/kubevela-logo-white.png';
import logoMark from '../../assets/KubeVela-01.svg';
import logoDark from '../../assets/kubevela-logo.png';
import { loadCustomisation } from '../../api/customisation';
import type { Customisation } from '../../services/CustomisationService';
import { customisationService } from '../../services/CustomisationService';
import { isLight, sidebarTheme } from '../../utils/theme';
import { If } from '../../components/If';
import Permission from '../../components/Permission';
import { TbLanguage } from 'react-icons/tb';
import { Translation } from '../../components/Translation';
import i18n from '../../i18n';
import type { AddonBaseStatus, Config, SystemInfo, LoginUserInfo } from '@velaux/data';
import { getData, setData } from '../../utils/cache';
import { getLanguage } from '../../utils/common';
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
  customisation: Customisation;
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
      customisation: customisationService.get(),
    };
  }

  unsubscribe?: () => void;

  componentDidMount() {
    this.loadSystemInfo();
    this.loadUserInfo();
    this.loadEnabledAddons();
    this.unsubscribe = customisationService.subscribe((customisation) => this.setState({ customisation }));
    loadCustomisation();
  }

  componentWillUnmount() {
    this.unsubscribe?.();
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

  // setLanguage switches the interface's language and remembers it.
  setLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('lang', lang);
    this.forceUpdate();
  };

  render() {
    const { show, userInfo, currentWorkspace, children, onToggleCollapsed } = this.props;
    // The admin dashboard is linked on its own; its pages join the sidebar
    // while it is open.
    const admin = this.state.workspaces.find((ws) => ws.name === 'admin');
    const collapsed = !!this.props.collapsed;
    const { customisation } = this.state;
    const theme = sidebarTheme(customisation.sidebarColor, customisation.accentColor);
    const light = !!customisation.sidebarColor && isLight(customisation.sidebarColor);
    const wordmark = customisation.logoURL || (light ? logoDark : logo);
    const logoSrc = collapsed ? customisation.iconURL || logoMark : wordmark;
    const userName = userInfo?.alias ? userInfo.alias : userInfo?.name;

    return (
      <div className={classNames('layout-sidebar', { collapsed })} style={theme as React.CSSProperties}>
        <div className="sidebar-brand">
          <Link to="/" className="sidebar-logo" title={'Make shipping applications more enjoyable.'}>
            <img
              src={logoSrc}
              className={classNames({
                'sidebar-logo-invert': collapsed && !customisation.iconURL && !light,
                'sidebar-logo-plate': !collapsed && customisation.logoURL && !light,
              })}
            />
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
          <If condition={userInfo}>
            <Dropdown
              triggerType="hover"
              align="bl br"
              offset={[8, 0]}
              trigger={
                <div className="sidebar-user" title={userName}>
                  <span className="sidebar-avatar">{(userName || '?').slice(0, 1).toUpperCase()}</span>
                  {!collapsed && <span className="sidebar-user-name">{userName}</span>}
                </div>
              }
            >
              <div className="user-flyout">
                <div className="user-flyout-head">
                  <span className="sidebar-avatar">{(userName || '?').slice(0, 1).toUpperCase()}</span>
                  <div>
                    <div className="user-flyout-name">{userName}</div>
                    {userInfo?.name && userInfo.name !== userName && (
                      <div className="user-flyout-sub">{userInfo.name}</div>
                    )}
                  </div>
                </div>
                <Permission request={{ resource: 'cloudshell', action: 'create' }}>
                  <div className="user-flyout-item" onClick={this.onOpenCloudShell}>
                    <AiOutlineCode size={16} />
                    <Translation>Cloud Shell</Translation>
                  </div>
                </Permission>
                {admin && (
                  <Link
                    to={admin.rootRoute}
                    className={classNames('user-flyout-item', { active: currentWorkspace?.name === admin.name })}
                  >
                    {admin.icon}
                    <Translation>{admin.label || admin.name}</Translation>
                  </Link>
                )}
                <Permission request={{ resource: 'systemSetting', action: 'update' }}>
                  <Link to="/settings" className="user-flyout-item">
                    <AiOutlineSetting size={16} />
                    <Translation>Settings</Translation>
                  </Link>
                </Permission>
                <a className="user-flyout-item" href="https://kubevela.io" target="_blank" rel="noopener noreferrer">
                  <AiOutlineQuestionCircle size={16} />
                  <Translation>Documentation</Translation>
                </a>
                <div className="user-flyout-item user-flyout-language">
                  <TbLanguage size={16} />
                  <Translation>Language</Translation>
                  <span className="user-flyout-langs">
                    {[
                      { lang: 'en', label: 'EN' },
                      { lang: 'zh', label: '中文' },
                    ].map((l) => (
                      <button
                        key={l.lang}
                        type="button"
                        className={classNames({ active: getLanguage() === l.lang })}
                        onClick={() => this.setLanguage(l.lang)}
                      >
                        {l.label}
                      </button>
                    ))}
                  </span>
                </div>
                <div className="user-flyout-divider" />
                <div className="user-flyout-item user-flyout-logout" onClick={this.onLogout}>
                  <AiOutlineLogout size={16} />
                  <Translation>Logout</Translation>
                </div>
              </div>
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
