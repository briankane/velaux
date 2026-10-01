import { Dialog } from '@alifd/next';
import React from 'react';
import { AiOutlineDelete, AiOutlineImport } from 'react-icons/ai';

import Empty from '../../../../components/Empty';
import { If } from '../../../../components/If';
import Permission from '../../../../components/Permission';
import { Chip, ResourceCard, ResourceGrid } from '../../../../components/ResourceCard';
import { Translation } from '../../../../components/Translation';
import type { ApplicationDetail, ApplicationSource } from '@velaux/data';
import { locale } from '../../../../utils/locale';

type Props = {
  sources: ApplicationSource[];
  applicationDetail?: ApplicationDetail;
  onDeleteSource: (name: string) => void;
  onShowSource: (source: ApplicationSource) => void;
};

// propertyChips shows a source's first few scalar properties; anything longer
// is in the source dialog.
const propertyChips = (properties?: Record<string, any>) =>
  Object.entries(properties || {})
    .filter(([, v]) => v !== null && typeof v !== 'object')
    .slice(0, 3)
    .map(([k, v]) => (
      <Chip key={k}>
        {k}: {String(v)}
      </Chip>
    ));

const autoUpdateLabel = (autoUpdate?: boolean) =>
  autoUpdate === undefined ? 'Auto update: default' : autoUpdate ? 'Auto update: on' : 'Auto update: off';

const SourceList = ({ sources, applicationDetail, onDeleteSource, onShowSource }: Props) => {
  const projectName = applicationDetail?.project?.name;
  const confirmDelete = (name: string) => {
    Dialog.alert({
      content: 'Are you sure want to delete this source?',
      onOk: () => onDeleteSource(name),
      locale: locale().Dialog,
    });
  };
  return (
    <div>
      <ResourceGrid>
        {sources.map((item) => (
          <ResourceCard
            key={item.name}
            icon={<AiOutlineImport />}
            title={item.name}
            subtitle={item.type}
            onOpen={() => onShowSource(item)}
            aside={
              <Permission
                request={{
                  resource: `project:${projectName}/application:${applicationDetail?.name}/source:${item.name}`,
                  action: 'delete',
                }}
                project={projectName}
              >
                <AiOutlineDelete className="resource-card-more danger-icon" onClick={() => confirmDelete(item.name)} />
              </Permission>
            }
            description={`Read with $(source.${item.name})`}
            chips={
              <React.Fragment>
                <Chip tone={item.autoUpdate ? 'accent' : undefined}>{autoUpdateLabel(item.autoUpdate)}</Chip>
                {propertyChips(item.properties)}
              </React.Fragment>
            }
          />
        ))}
      </ResourceGrid>
      <If condition={sources.length == 0}>
        <Empty
          style={{ minHeight: '400px' }}
          message={
            <span>
              <Translation>There are no sources</Translation>
            </span>
          }
        />
      </If>
    </div>
  );
};

export default SourceList;
