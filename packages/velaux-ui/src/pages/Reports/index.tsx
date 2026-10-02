import { Button, Loading, Table } from '@alifd/next';
import { connect } from 'dva';
import { Link } from 'dva/router';
import React, { useEffect, useState } from 'react';
import { AiOutlineDownload } from 'react-icons/ai';
import { HiOutlineRefresh } from 'react-icons/hi';

import { listReports, runReport } from '../../api/report';
import Empty from '../../components/Empty';
import { ListTitle } from '../../components/ListTitle';
import { Translation } from '../../components/Translation';
import i18n from '../../i18n';
import { momentDate } from '../../utils/common';
import { allProjects } from '../../utils/currentProject';
import { locale } from '../../utils/locale';
import { toCSV } from './csv';
import './index.less';

type ReportMeta = { id: string; title: string; description: string };
type ReportResult = {
  report: ReportMeta;
  generatedAt: string;
  columns: Array<{ key: string; title: string }>;
  rows: Array<{ values: Record<string, any>; link?: string }>;
  chart?: { title: string; bars: Array<{ label: string; value: number }> };
};

// BarChart is a report's summary as horizontal bars, longest to scale.
const BarChart = (props: { chart: NonNullable<ReportResult['chart']> }) => {
  const max = Math.max(...props.chart.bars.map((b) => b.value), 1);
  return (
    <div className="report-chart">
      <div className="report-chart-title">
        <Translation>{props.chart.title}</Translation>
      </div>
      {props.chart.bars.map((bar) => (
        <div className="report-bar" key={bar.label}>
          <span className="report-bar-label" title={bar.label}>
            {bar.label}
          </span>
          <span className="report-bar-track">
            <span className="report-bar-fill" style={{ width: `${(bar.value / max) * 100}%` }} />
          </span>
          <span className="report-bar-value">{bar.value}</span>
        </div>
      ))}
    </div>
  );
};

// Reports runs the built-in reports over the project picked in the top bar.
const ReportsView = (props: { currentProject?: { current: string; resolved: boolean } }) => {
  const project = props.currentProject?.resolved ? props.currentProject.current : undefined;
  const [catalogue, setCatalogue] = useState<ReportMeta[]>([]);
  const [selected, setSelected] = useState<string>();
  const [result, setResult] = useState<ReportResult>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setResult(undefined);
    if (!project) {
      return;
    }
    listReports(project).then((res: any) => {
      const reports: ReportMeta[] = res?.reports || [];
      setCatalogue(reports);
      setSelected((current) => current || reports[0]?.id);
    });
  }, [project]);

  const run = () => {
    if (!project || !selected) {
      return;
    }
    setLoading(true);
    runReport(project, selected)
      .then((res: any) => setResult(res ? { ...res, rows: res.rows || [] } : undefined))
      .finally(() => setLoading(false));
  };
  useEffect(run, [project, selected]);

  const download = () => {
    if (!result) {
      return;
    }
    const blob = new Blob([toCSV(result.columns, result.rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project}-${result.report.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="reports">
      <ListTitle
        title="Reports"
        subTitle="Questions about the picked project, answered from its applications and namespaces."
      />
      {project === allProjects ? (
        <Empty
          message={<Translation>Pick a project in the top bar. Reports run over one project at a time.</Translation>}
        />
      ) : (
        <div className="reports-body">
          <nav className="reports-catalogue">
            {catalogue.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`reports-item ${selected === r.id ? 'active' : ''}`}
                onClick={() => setSelected(r.id)}
              >
                <span className="reports-item-title">
                  <Translation>{r.title}</Translation>
                </span>
                <span className="reports-item-description">
                  <Translation>{r.description}</Translation>
                </span>
              </button>
            ))}
          </nav>
          <section className="reports-result">
            <div className="reports-result-head">
              <div>
                <div className="reports-result-title">{result && <Translation>{result.report.title}</Translation>}</div>
                {result && (
                  <div className="reports-result-meta">
                    {result.rows.length} <Translation>rows</Translation> · <Translation>generated</Translation>{' '}
                    {momentDate(result.generatedAt)}
                  </div>
                )}
              </div>
              <div className="reports-result-actions">
                <Button onClick={run} title={i18n.t('Run again').toString()}>
                  <HiOutlineRefresh />
                </Button>
                <Button onClick={download} disabled={!result || result.rows.length === 0}>
                  <AiOutlineDownload />
                  <Translation>Export CSV</Translation>
                </Button>
              </div>
            </div>
            <Loading visible={loading} style={{ width: '100%' }}>
              {result?.chart && <BarChart chart={result.chart} />}
              <Table
                locale={locale().Table}
                dataSource={(result?.rows || []).map((r) => ({ ...r.values, _link: r.link }))}
              >
                {(result?.columns || []).map((col, i) => (
                  <Table.Column
                    key={col.key}
                    title={<Translation>{col.title}</Translation>}
                    dataIndex={col.key}
                    cell={(v: any, _: number, row: any) =>
                      i === 0 && row._link ? <Link to={row._link}>{String(v ?? '')}</Link> : String(v ?? '')
                    }
                  />
                ))}
              </Table>
            </Loading>
          </section>
        </div>
      )}
    </div>
  );
};

export default connect((store: any) => ({ currentProject: store.currentProject }))(ReportsView);
