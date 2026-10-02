import { expect } from 'chai';

import {
  autoText,
  definitionLink,
  durationMs,
  minIntervalMs,
  withOverride,
  groupPreview,
  parseSource,
  sourceText,
} from '../../pages/DefKitModules/defkit';

describe('defkit', () => {
  it('links a definition to its page by kind', () => {
    expect(definitionLink('TraitDefinition', 'scaler')).to.equal('/definitions/trait/scaler/doc');
    expect(definitionLink('WorkflowStepDefinition', 'deploy')).to.equal('/definitions/workflowstep/deploy/doc');
  });

  it('reads a URL as a git repository and anything else as a Go module', () => {
    expect(parseSource(' https://github.com/org/defs ', 'main', '', [])).to.deep.equal({
      git: 'https://github.com/org/defs',
      version: 'main',
      prefix: undefined,
      types: undefined,
    });
    expect(parseSource('github.com/org/defs', '', 'dk-', ['trait'])).to.deep.equal({
      ref: 'github.com/org/defs',
      version: undefined,
      prefix: 'dk-',
      types: ['trait'],
    });
    expect(parseSource('git@github.com:org/defs.git', '', '', []).git).to.equal('git@github.com:org/defs.git');
  });

  it('shows a source with its version', () => {
    expect(sourceText({ git: 'https://x/defs', version: 'v1' })).to.equal('https://x/defs@v1');
    expect(sourceText({ ref: 'github.com/org/defs' })).to.equal('github.com/org/defs');
  });

  it('puts what the review decides first and drops empty groups', () => {
    const groups = groupPreview([
      { kind: 'TraitDefinition', name: 'b', status: 'new' },
      { kind: 'TraitDefinition', name: 'a', status: 'new' },
      { kind: 'TraitDefinition', name: 'c', status: 'conflict' },
      { kind: 'TraitDefinition', name: 'd', status: 'unchanged' },
    ]);
    expect(groups.map((g) => g.status)).to.deep.equal(['conflict', 'new', 'unchanged']);
    expect(groups[1].items.map((i) => i.name)).to.deep.equal(['a', 'b']);
  });

  it('sets and clears a definition override', () => {
    const one = withOverride({ deletionPolicy: 'retain' }, 'TraitDefinition/x', 'delete');
    expect(one.overrides).to.deep.equal({ 'TraitDefinition/x': 'delete' });
    expect(withOverride(one, 'TraitDefinition/x', undefined).overrides).to.equal(undefined);
  });

  it('says how often a module updates itself', () => {
    expect(autoText({ autoUpdate: true })).to.equal('10m');
    expect(autoText({ autoUpdate: true, interval: '1h' })).to.equal('1h');
    expect(autoText({ interval: '1h' })).to.equal('');
  });

  it('reads a duration and holds the 5m minimum', () => {
    expect(durationMs('1h30m')).to.equal(5400000);
    expect(durationMs(' 10m ')).to.equal(600000);
    expect(durationMs('soon')).to.equal(undefined);
    expect(durationMs('4m59s')! < minIntervalMs).to.equal(true);
    expect(durationMs('5m')! >= minIntervalMs).to.equal(true);
  });
});
