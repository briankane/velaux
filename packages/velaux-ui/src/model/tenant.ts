import { allTenants, tenantKey } from '../utils/tenant';

// tenant is the tenant every view is scoped to; allTenants is all of them.
const tenant: any = {
  namespace: 'tenant',
  state: {
    current: allTenants,
    resolved: false,
  },
  reducers: {
    setTenant(state: any, { payload }: { payload: string }) {
      try {
        localStorage.setItem(tenantKey, payload);
      } catch (e) {
        // A browser that keeps nothing still scopes this session.
      }
      return { ...state, current: payload, resolved: true };
    },
  },
};

export default tenant;
