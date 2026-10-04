import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Translation } from '../../components/Translation';
import type { ReportChart } from './view';
import { chartRows } from './view';

const palette = ['#1b58f4', '#00b578', '#ff8f1f', '#7c3aed', '#e5484d', '#0ea5e9', '#d946ef', '#64748b'];
const colour = (i: number) => palette[i % palette.length];
const axis = { fontSize: 11, fill: '#64748b' };

// ReportChartView draws a report's chart: bars (stacked by series, sideways
// where labels are many), a line per series, or a donut.
export const ReportChartView = (props: { chart: ReportChart }) => {
  const { chart } = props;
  const rows = chartRows(chart);
  const many = rows.length > 8;
  const legend = chart.series.length > 1;
  let body: React.ReactElement;
  if (chart.type === 'pie') {
    const series = chart.series[0];
    body = (
      <PieChart>
        <Pie data={rows} dataKey={series} nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={1}>
          {rows.map((r, i) => (
            <Cell key={String(r.label)} fill={colour(i)} />
          ))}
        </Pie>
        <Tooltip />
        <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
      </PieChart>
    );
  } else if (chart.type === 'line') {
    body = (
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={axis} />
        <YAxis tick={axis} allowDecimals={false} width={40} />
        <Tooltip />
        {legend && <Legend iconType="circle" />}
        {chart.series.map((s, i) => (
          <Line key={s} type="monotone" dataKey={s} stroke={colour(i)} strokeWidth={2} dot={{ r: 3 }} />
        ))}
      </LineChart>
    );
  } else {
    body = (
      <BarChart
        data={rows}
        layout={many ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
      >
        <CartesianGrid stroke="#e2e8f0" horizontal={!many} vertical={many} />
        {many ? (
          <>
            <XAxis type="number" tick={axis} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={axis} width={160} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={axis} interval={0} />
            <YAxis tick={axis} allowDecimals={false} width={40} />
          </>
        )}
        <Tooltip cursor={{ fill: '#f1f5f9' }} />
        {legend && <Legend iconType="circle" />}
        {chart.series.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            stackId="all"
            fill={colour(i)}
            maxBarSize={36}
            radius={i === chart.series.length - 1 ? 3 : 0}
          />
        ))}
      </BarChart>
    );
  }
  const height = chart.type === 'bar' && many ? Math.min(28 * rows.length + 40, 520) : 240;
  return (
    <div className="report-chart">
      {chart.title && (
        <div className="report-chart-title">
          <Translation>{chart.title}</Translation>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {body}
      </ResponsiveContainer>
    </div>
  );
};
