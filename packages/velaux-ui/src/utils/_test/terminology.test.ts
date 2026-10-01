import { expect } from 'chai';

import { applyTerminology, pluralOf } from '../terminology';

const terms = {
  Application: { singular: 'Service', plural: 'Services' },
  Environment: { singular: 'Orbit', plural: 'Orbits' },
  Target: { singular: 'Namespace', plural: 'Namespaces' },
  Cluster: { singular: 'Asteroid', plural: 'Asteroids' },
};

describe('terminology', () => {
  it('renames singular and plural, keeping the case written', () => {
    expect(applyTerminology('Applications', terms)).to.equal('Services');
    expect(applyTerminology('New Application', terms)).to.equal('New Service');
    expect(applyTerminology('There are no applications', terms)).to.equal('There are no services');
    expect(applyTerminology('Bind Environments', terms)).to.equal('Bind Orbits');
    expect(applyTerminology('CLUSTER', terms)).to.equal('ASTEROID');
  });

  it('renames several words in one string', () => {
    expect(applyTerminology('Deploy the application to a target in each environment', terms)).to.equal(
      'Deploy the service to a namespace in each orbit'
    );
  });

  it('renames whole words only', () => {
    expect(applyTerminology('targeting clusterVersion', terms)).to.equal('targeting clusterVersion');
    expect(applyTerminology('Multi-Cluster', terms)).to.equal('Multi-Asteroid');
  });

  it('leaves text alone without terms', () => {
    expect(applyTerminology('Applications', {})).to.equal('Applications');
    expect(applyTerminology('', terms)).to.equal('');
  });

  it('derives the plural the UI writes', () => {
    expect(pluralOf('Application')).to.equal('Applications');
    expect(pluralOf('Policy')).to.equal('Policies');
    expect(pluralOf('Address')).to.equal('Addresses');
  });
});
