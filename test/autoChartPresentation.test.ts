import { describe, expect, it } from 'vitest';

import { analyzeAutoChartData, buildForecastBasisLabel } from '../src/lib/autoChartPresentation';

describe('autoChartPresentation', () => {
  it('prioritizes PAT for finance-style monthly tables and disables pie mode', () => {
    const analysis = analyzeAutoChartData([
      { period: "Jan'25", 'Revenue from operations': 110109, 'Total Income': 110364, 'Total expenses': -92330, 'Profit before tax (EBIT)': 18035, 'Profit for the year (PAT)': 13344 },
      { period: "Feb'25", 'Revenue from operations': 109935, 'Total Income': 110104, 'Total expenses': -103161, 'Profit before tax (EBIT)': 6943, 'Profit for the year (PAT)': 5138 },
      { period: "Mar'25", 'Revenue from operations': 116567, 'Total Income': 116863, 'Total expenses': -110542, 'Profit before tax (EBIT)': 6321, 'Profit for the year (PAT)': 4674 },
    ]);

    expect(analysis?.forecastMetric).toBe('Profit for the year (PAT)');
    expect(analysis?.defaultType).toBe('line');
    expect(analysis?.availableChartTypes.includes('pie')).toBe(false);
    expect(analysis?.resolvedTitle).toContain('PAT');
  });

  it('keeps pie available for small non-time categorical distributions', () => {
    const analysis = analyzeAutoChartData([
      { region: 'North', value: 12 },
      { region: 'South', value: 8 },
      { region: 'West', value: 5 },
    ]);

    expect(analysis?.availableChartTypes.includes('pie')).toBe(true);
    expect(analysis?.defaultType).toBe('pie');
  });

  it('describes the forecast basis clearly', () => {
    expect(buildForecastBasisLabel('Profit for the year (PAT)', 'movingAverage', ["Jan'25", "Feb'25", "Mar'25"]))
      .toContain('3-point moving average');
  });
});