import { expect } from 'chai';

import { newServiceRequest } from '../../pages/ApplicationList/components/NewServiceDialog/request';

describe('new service', () => {
  it('asks for an application with no component, bound to its orbits', () => {
    const req = newServiceRequest({ name: 'shop', project: 'default', envs: ['dev', 'prod'] });
    expect(req).to.deep.equal({
      name: 'shop',
      alias: undefined,
      description: undefined,
      project: 'default',
      labels: undefined,
      annotations: undefined,
      envBinding: [{ name: 'dev' }, { name: 'prod' }],
      workflowMode: undefined,
    });
    expect(req).to.not.have.property('component');
  });

  it('writes its settings as the metadata the controller reads', () => {
    const req = newServiceRequest({
      name: 'shop',
      project: 'default',
      labels: { team: 'a' },
      annotations: { note: 'x' },
      expressions: true,
      paused: true,
      resyncInterval: ' 10m ',
      workflowMode: 'DAG',
    });
    expect(req.labels).to.deep.equal({ team: 'a', 'controller.core.oam.dev/pause': 'true' });
    expect(req.annotations).to.deep.equal({
      note: 'x',
      'app.oam.dev/cel-expressions': 'true',
      'app.oam.dev/reconcile-interval': '10m',
    });
    expect(req.workflowMode).to.equal('DAG');
  });
});
