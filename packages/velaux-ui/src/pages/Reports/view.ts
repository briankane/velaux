import { momentDate } from '../../utils/common';

export type ReportFormat = 'time' | 'duration' | 'percent' | 'badge';

export type ReportChart = {
  type: 'bar' | 'line' | 'pie';
  title?: string;
  series: string[];
  points: Array<{ label: string; values: Record<string, number> }>;
};

// formatCell is a report value as its column's format shows it; a badge is
// drawn by the table, so here it is its text.
export function formatCell(value: any, format?: ReportFormat): string {
  if (value === undefined || value === null) {
    return '';
  }
  switch (format) {
    case 'time':
      return momentDate(value);
    case 'percent':
      return `${value}%`;
    case 'duration': {
      const seconds = Number(value);
      if (Number.isNaN(seconds)) {
        return String(value);
      }
      const units: Array<[string, number]> = [
        ['d', 86400],
        ['h', 3600],
        ['m', 60],
        ['s', 1],
      ];
      const parts: string[] = [];
      let left = Math.round(seconds);
      units.forEach(([unit, size]) => {
        if (parts.length < 2 && left >= size) {
          parts.push(`${Math.floor(left / size)}${unit}`);
          left %= size;
        }
      });
      return parts.length ? parts.join(' ') : '0s';
    }
  }
  return String(value);
}

// chartRows are a chart's points as the chart library reads them: a row per
// point with a key per series, a series a point lacks being zero.
export function chartRows(chart: ReportChart): Array<Record<string, string | number>> {
  return chart.points.map((p) => {
    const row: Record<string, string | number> = { label: p.label };
    chart.series.forEach((s) => (row[s] = p.values[s] ?? 0));
    return row;
  });
}

// latestOnly tracks requests so only the latest one's response arrives: an
// earlier one, still in flight when the next starts, never settles.
export function latestOnly() {
  let latest = 0;
  return function track<T>(request: Promise<T>): Promise<T> {
    const mine = ++latest;
    return new Promise<T>((resolve, reject) => {
      request.then(
        (value) => mine === latest && resolve(value),
        (err) => mine === latest && reject(err)
      );
    });
  };
}
