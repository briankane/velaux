import { expect } from 'chai';

import {
  componentDependsOn,
  componentHealth,
  flattenProperties,
} from '../../pages/ApplicationConfig/components/ComponentList/model';

describe('component list', () => {
  it("gives a component's health in each env it is placed in", () => {
    const statuses = [
      { envName: 'dev', status: { services: [{ name: 'api', healthy: true }] } },
      { envName: 'prod', status: { services: [{ name: 'api', healthy: false, message: 'Ready:0/1' }] } },
      { envName: 'test', status: { services: [{ name: 'db', healthy: true }] } },
    ];
    expect(componentHealth('api', statuses)).to.deep.equal([
      { env: 'dev', health: 'healthy', message: undefined },
      { env: 'prod', health: 'unhealthy', message: 'Ready:0/1' },
    ]);
  });

  it('is unhealthy in an env where any placement is', () => {
    const statuses = [
      {
        envName: 'prod',
        status: {
          services: [
            { name: 'api', healthy: true, cluster: 'east' },
            { name: 'api', healthy: false, cluster: 'west', message: 'CrashLoop' },
          ],
        },
      },
    ];
    expect(componentHealth('api', statuses)[0]).to.deep.equal({
      env: 'prod',
      health: 'unhealthy',
      message: 'CrashLoop',
    });
  });

  it('lists properties by path', () => {
    expect(
      flattenProperties({
        image: 'api:1.4',
        ports: [{ port: 80 }],
        env: { LOG: 'debug' },
        args: ['a', 'b'],
        replicas: 2,
      })
    ).to.deep.equal([
      { key: 'image', value: 'api:1.4' },
      { key: 'ports', value: '1 item' },
      { key: 'env.LOG', value: 'debug' },
      { key: 'args', value: 'a, b' },
      { key: 'replicas', value: '2' },
    ]);
  });

  it('lists written dependencies, then inferred ones not already written', () => {
    const deps = componentDependsOn(
      ['db'],
      [
        { name: 'db', direction: 'outbound' },
        { name: 'db', direction: 'outbound', inferred: 'reads db' },
        { name: 'cache', direction: 'outbound', inferred: 'reads cache' },
        { name: 'web', direction: 'inbound' },
      ]
    );
    expect(deps.map((d) => [d.name, !!d.inferred])).to.deep.equal([
      ['db', false],
      ['cache', true],
    ]);
  });

  it('keeps an inferred read of another placement beside the written one', () => {
    const deps = componentDependsOn(['db'], [{ name: 'db', direction: 'outbound', inferred: 'reads', where: 'east' }]);
    expect(deps.map((d) => [d.name, d.where])).to.deep.equal([
      ['db', undefined],
      ['db', 'east'],
    ]);
  });
});
