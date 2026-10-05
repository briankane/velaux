import type { Config, ConfigTemplate } from '@velaux/data';

export type TemplateOption = { name: string; alias?: string };

// templateOptions are the templates the list can be filtered by: those it can
// create from, and those of every config it shows, which in a project include
// the global configs shared with it, whose templates it cannot create from.
export function templateOptions(templates: ConfigTemplate[], configs: Config[]): TemplateOption[] {
  const options: TemplateOption[] = templates.map((t) => ({ name: t.name, alias: t.alias }));
  for (const c of configs) {
    const name = c.template?.name;
    if (name && !options.some((o) => o.name === name)) {
      options.push({ name, alias: c.templateAlias });
    }
  }
  return options;
}
