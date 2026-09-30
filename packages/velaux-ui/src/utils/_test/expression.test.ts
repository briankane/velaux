import { expect } from 'chai';

import type { ExpressionEnv } from '../../extends/ExpressionEditor/completion';
import { expressionSpans, openExpression, suggest } from '../../extends/ExpressionEditor/completion';

const env: ExpressionEnv = {
  enabled: true,
  optedIn: true,
  surface: 'component',
  variables: [
    {
      name: 'context',
      type: 'object',
      children: [
        { name: 'appName', type: 'string', description: 'The application name' },
        { name: 'clusterVersion', type: 'object', children: [{ name: 'minor', type: 'int' }] },
        { name: 'appLabels', type: 'map(string, string)' },
      ],
    },
    { name: 'source', type: 'object', children: [{ name: 'db', type: 'object', children: [{ name: 'host', type: 'string' }] }] },
  ],
};

const labels = (before: string) => suggest(before, env).items.map((i) => i.label);

describe('expression suggestions', () => {
  it('offers to start an expression outside one', () => {
    expect(labels('http://')).to.deep.equal(['$( )']);
    expect(labels('$(context.appName) done')).to.deep.equal(['$( )']);
  });
  it('offers the roots and functions at the start of an expression', () => {
    expect(labels('$(')).to.include.members(['context', 'source', 'has', 'int']);
  });
  it('offers the fields of what precedes a dot', () => {
    expect(labels('$(context.')).to.include.members(['appName', 'clusterVersion']);
    expect(labels('$(context.clusterVersion.')).to.deep.equal(['minor']);
    expect(labels('x-$(source.db.')).to.deep.equal(['host']);
  });
  it('replaces the part of a name already typed', () => {
    expect(suggest('$(context.app', env).replace).to.equal(3);
  });
  it('offers the methods of a string', () => {
    expect(labels('$(context.appName.')).to.include.members(['startsWith', 'lowerAscii']);
  });
  it('knows when a quoted paren does not close the expression', () => {
    expect(openExpression('$(context.appName == ")"')).to.equal(2);
    expect(openExpression('$(a) and $$(b')).to.equal(undefined);
  });
});

describe('expression spans', () => {
  it('frames each expression, parens and all', () => {
    expect(expressionSpans('img/$(context.appName):$(string(context.appRevisionNum))')).to.deep.equal([
      [4, 22],
      [23, 56],
    ]);
  });
  it('ignores a paren inside quotes and an escaped $$(', () => {
    expect(expressionSpans('$(a == ")") $$(b)')).to.deep.equal([[0, 11]]);
  });
  it('runs an unclosed expression to the end', () => {
    expect(expressionSpans('x $(context.')).to.deep.equal([[2, 12]]);
  });
});
