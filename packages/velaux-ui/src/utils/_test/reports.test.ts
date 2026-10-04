import { expect } from 'chai';

import { chartRows, formatCell, latestOnly } from '../../pages/Reports/view';

describe('formatCell', () => {
  it('shows a percent', () => {
    expect(formatCell(80, 'percent')).to.equal('80%');
  });
  it('shows a duration in seconds as the largest units', () => {
    expect(formatCell(3725, 'duration')).to.equal('1h 2m');
    expect(formatCell(45, 'duration')).to.equal('45s');
  });
  it('shows nothing for a missing value, whatever the format', () => {
    expect(formatCell(null, 'percent')).to.equal('');
    expect(formatCell(undefined, 'time')).to.equal('');
  });
  it('shows anything else as text', () => {
    expect(formatCell(3, undefined)).to.equal('3');
    expect(formatCell(true, undefined)).to.equal('true');
  });
});

describe('chartRows', () => {
  it('is a row per point, a key per series, missing ones zero', () => {
    expect(
      chartRows({
        type: 'bar',
        series: ['a', 'b'],
        points: [
          { label: 'x', values: { a: 1 } },
          { label: 'y', values: { a: 2, b: 3 } },
        ],
      })
    ).to.deep.equal([
      { label: 'x', a: 1, b: 0 },
      { label: 'y', a: 2, b: 3 },
    ]);
  });
});

describe('latestOnly', () => {
  it('drops a response that is no longer for the latest request', async () => {
    const track = latestOnly();
    let slow: (v: string) => void = () => {};
    const first = track(new Promise<string>((resolve) => (slow = resolve)));
    const second = track(Promise.resolve('second'));
    const seen: string[] = [];
    first.then((v) => seen.push(v));
    second.then((v) => seen.push(v));
    await second;
    slow('first');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).to.deep.equal(['second']);
  });
});
