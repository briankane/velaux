import { expect } from 'chai';

import type { Config, ConfigTemplate } from '@velaux/data';
import { templateOptions } from '../../pages/Configs/templates';

describe('config template filter', () => {
  const template = (name: string, alias?: string) => ({ name, alias } as ConfigTemplate);
  const config = (name: string, templateName: string, templateAlias?: string) =>
    ({ name, template: { name: templateName, namespace: 'vela-system' }, templateAlias } as Config);

  it('offers the templates the page can create from', () => {
    expect(templateOptions([template('image-registry', 'Image registry')], [])).to.deep.equal([
      { name: 'image-registry', alias: 'Image registry' },
    ]);
  });

  it('adds the templates of the configs shown, once each', () => {
    const options = templateOptions(
      [template('image-registry')],
      [
        config('cluster-info', 'cluster-info', 'Cluster info'),
        config('other', 'cluster-info'),
        config('reg', 'image-registry'),
      ]
    );
    expect(options.map((o) => o.name)).to.deep.equal(['image-registry', 'cluster-info']);
    expect(options[1].alias).to.equal('Cluster info');
  });
});
