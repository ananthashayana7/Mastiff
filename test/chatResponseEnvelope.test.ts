import { describe, expect, it } from 'vitest';
import {
  buildAnalysisResponseEnvelope,
  buildAnalysisBodyContent,
  buildFollowUpPrompts,
  renderEnvelopeAsSummary,
} from '../src/lib/chatResponseEnvelope';

describe('chat response envelope', () => {
  it('accepts valid 3-bullet + forecast summary without fallback', () => {
    const summary = [
      'Executive Signal: Margin held, but one cost bucket is eroding the run-rate.',
      '1) Revenue increased 12% QoQ in the north region.',
      '2) Gross margin expanded 2.1 points after discounting eased in the core mix.',
      '3) The biggest drag is freight inflation, which widened faster than price realization.',
      '4) Leadership should protect high-margin SKUs before chasing low-quality volume.',
      '5) The current mix shift is supportive, but only if lane-level leakage is contained in the next cycle.',
      '→ Action: Tighten freight surcharge recovery on the worst-affected lanes.',
      '→ Action: Rebalance inventory toward the highest-margin SKUs this cycle.',
      '→ Action: Review discount exceptions weekly until contribution stabilizes.',
      'Forecast: Current trend suggests continued mid-single-digit growth next quarter.',
      'Data Quality: Reliable for directional decisions; null rates remain below 1% in key fields.',
    ].join('\n');

    const result = buildAnalysisResponseEnvelope(summary, { hasChart: true, hasCode: true });
    expect(result.usedFallback).toBe(false);
    expect(result.envelope.headline).toContain('Margin held');
    expect(result.envelope.insights).toHaveLength(5);
    expect(result.envelope.actions).toHaveLength(3);
    expect(result.envelope.forecast).toContain('continued mid-single-digit growth');
    expect(result.envelope.forecastOptions).toHaveLength(3);
    expect(result.envelope.forecastOptions[0].label).toBe('Base Case');
    expect(result.envelope.decisionGrade).toBe('Directional');
    expect(result.envelope.confidence.label).toBe('Moderate');
    expect(result.envelope.coverage.length).toBeGreaterThan(20);
    expect(result.envelope.watchouts.length).toBeGreaterThanOrEqual(2);
    expect(result.envelope.dataQuality).toContain('Data Quality');
  });

  it('falls back to deterministic envelope when structure is missing', () => {
    const summary = 'General narrative with no bullets and no explicit forecast sentence.';
    const result = buildAnalysisResponseEnvelope(summary, { hasChart: false, hasCode: true });

    expect(result.usedFallback).toBe(true);
    expect(result.envelope.insights.length).toBeGreaterThanOrEqual(3);
    expect(result.envelope.actions).toHaveLength(3);
    expect(result.envelope.forecast.length).toBeGreaterThan(10);
    expect(result.envelope.forecastOptions).toHaveLength(3);
    expect(result.envelope.decisionGrade).toBe('Needs review');
    expect(result.envelope.confidence.label).toBe('Low');
    expect(result.envelope.watchouts.length).toBeGreaterThanOrEqual(2);
  });

  it('renders envelope into compact summary format', () => {
    const summary = [
      'Executive Signal: Demand is improving, but margin capture still needs intervention.',
      '1) Gross margin improved by 2.1 points.',
      '2) Volume improved in the highest-conversion segment.',
      '3) Freight and discount leakage remain the main margin risk.',
      '4) Reinvestment should follow the strongest contribution pockets only.',
      '5) The next month will only hold the gain if leakage does not return in the weakest lanes.',
      '→ Action: Shift spend into the best-converting priority segment.',
      '→ Action: Audit freight leakage on the worst lanes this week.',
      '→ Action: Tighten exception-based discounting before next month.',
      'Forecast: Momentum indicates incremental growth if spend remains constant.',
      'Data Quality: Stable for decision support.',
    ].join('\n');

    const { envelope } = buildAnalysisResponseEnvelope(summary, { hasChart: true, hasCode: true });
    const rendered = renderEnvelopeAsSummary(envelope);

    expect(rendered).toContain('Executive Signal');
    expect(rendered).toContain('1) ');
    expect(rendered).toContain('2) ');
    expect(rendered).toContain('3) ');
    expect(rendered).toContain('4) ');
    expect(rendered).toContain('5) ');
    expect(rendered).toContain('→ Action: ');
    expect(rendered).toContain('Forecast: ');
    expect(rendered).toContain('Data Quality: ');
  });

  it('derives follow-up prompts from the envelope for one-click next steps', () => {
    const summary = [
      'Executive Signal: Margin is improving, but freight leakage still needs attention.',
      '1) Gross margin improved 2.1 points in the latest period.',
      '2) Freight remains the main drag on contribution quality.',
      '3) The strongest performance cluster is still underinvested.',
      '4) The current trend is strong enough to justify a targeted execution plan.',
      '→ Action: Recover freight surcharge leakage on the worst lanes.',
      '→ Action: Reallocate spend into the best-converting segment.',
      '→ Action: Add weekly KPI checkpoints before scaling the plan.',
      'Forecast: Short-term direction remains positive if cost leakage is contained.',
      'Data Quality: Reliable for directional decisions with minor null noise.',
    ].join('\n');

    const { envelope } = buildAnalysisResponseEnvelope(summary, { hasChart: true, hasCode: true });
    const prompts = buildFollowUpPrompts(envelope);

    expect(prompts.length).toBeGreaterThanOrEqual(3);
    expect(prompts[0]).toContain('rows, segments, and metric drivers');
    expect(envelope.forecastOptions.some((option) => option.label === 'Stress Case')).toBe(true);
    expect(prompts.some((prompt) => prompt.includes('30-60-90 day execution plan'))).toBe(true);
  });

  it('uses dataset context to suggest better follow-up loops', () => {
    const summary = [
      'Executive Signal: Rejects improved overall, but one shift still concentrates the quality loss.',
      '1) Reject quantity fell 18% week over week.',
      '2) Shift B still explains the largest reject concentration.',
      '3) The newest line recovered fastest after the last intervention.',
      '4) A deeper before-vs-after read is needed around the March process change.',
      '5) Forecast risk stays tied to the same unstable shift pattern.',
      'Action: Audit Shift B changeovers this week.',
      'Action: Lock in the recovered line settings as the new baseline.',
      'Action: Add a weekly quality checkpoint before scaling output.',
      'Forecast: Base case improves if the unstable shift stops leaking rejects.',
      'Data Quality: Directional but good enough for operating decisions.',
    ].join('\n');

    const { envelope } = buildAnalysisResponseEnvelope(summary, { hasChart: true, hasCode: true });
    const prompts = buildFollowUpPrompts(envelope, {
      provenance: {
        sourceFiles: [{ name: 'ops_march.xlsx' }, { name: 'ops_april.xlsx' }],
        reliability: { label: 'Moderate', notes: ['Partial schema overlap across files.'] },
      },
      datasets: [{
        name: 'ops_march.xlsx',
        candidateKpis: ['reject_qty'],
        measures: ['reject_qty', 'total_produced'],
        dimensions: ['shift', 'line'],
        dateFields: ['posting_date'],
        keyCandidates: ['sku'],
        analysisMemory: {
          commonFilters: ['after March'],
          previousCharts: ['line'],
        },
      }],
    });

    expect(prompts.some((prompt) => prompt.includes('Break reject_qty down by shift'))).toBe(true);
    expect(prompts.some((prompt) => prompt.includes('before and after the key shift in posting_date'))).toBe(true);
    expect(prompts.some((prompt) => prompt.includes('Compare the active source files'))).toBe(true);
  });

  it('uses provenance to shape decision grade, coverage, and watchouts', () => {
    const summary = [
      'Executive Signal: Revenue is recovering, but one region still carries the downside case.',
      '1) Revenue increased 11.4% in the latest month.',
      '2) South region still explains most of the profit gap.',
      '3) Forecast improves only if freight leakage stays contained.',
      '4) The recovery is real, but the weakest lane remains fragile.',
      '5) Management can move now if the weakest slice is monitored weekly.',
      'Action: Tighten pricing and freight recovery in the south region this week.',
      'Action: Lock in the stronger regional playbook as the operating baseline.',
      'Action: Add a weekly downside trigger review before scaling the plan.',
      'Forecast: Base case remains constructive, but low-confidence downside risk still sits in the south region.',
      'Data Quality: Directional only until cross-file overlap is validated.',
    ].join('\n');

    const result = buildAnalysisResponseEnvelope(summary, {
      hasChart: true,
      hasCode: true,
      provenance: {
        sourceFiles: [
          { name: 'regional_actuals.csv', rowCount: 1200, columnCount: 18 },
          { name: 'regional_budget.csv', rowCount: 1200, columnCount: 16 },
        ],
        rowsAnalyzed: 2400,
        columnsConsidered: ['region', 'revenue', 'profit', 'freight_cost'],
        dateRange: {
          field: 'month',
          min: '2025-01-01',
          max: '2025-06-01',
        },
        reliability: {
          label: 'Moderate',
          notes: ['Partial schema overlap across files.'],
        },
        warnings: ['Small share of rows required fallback coercion.'],
      },
    });

    expect(result.usedFallback).toBe(false);
    expect(result.envelope.decisionGrade).toBe('Directional');
    expect(result.envelope.confidence.label).toBe('Moderate');
    expect(result.envelope.coverage).toContain('2 source files');
    expect(result.envelope.coverage).toContain('2,400 analyzed rows');
    expect(result.envelope.watchouts.some((watchout) => /schema overlap/i.test(watchout))).toBe(true);
    expect(result.envelope.watchouts.some((watchout) => /fallback coercion/i.test(watchout))).toBe(true);
  });

  it('cleans noisy action and impact labels out of key insights', () => {
    const summary = [
      'Executive Signal',
      'Executive Summary',
      '1) Optimize inventory management to reduce waste and stabilize profitability.',
      '2) Action: Implement a robust inventory forecasting and control system to minimize stock write-downs and obsolescence.',
      '3) Evidence: The -24,325 T INR changes in inventories in May 25 were the primary driver of the 86.6% PAT drop.',
      '4) Impact: High (Profit, Environmental Sustainability)',
      'Action: Assign a finance owner to the monthly inventory bridge.',
      'Action: Reconcile write-down and valuation logic before the next close.',
      'Action: Split obsolete stock from normal inventory in management reporting.',
      'Forecast: Action: Implement a robust inventory forecasting and control system.',
      'Data Quality: Directional only - add data or tighter scope for higher-confidence guidance.',
    ].join('\n');

    const result = buildAnalysisResponseEnvelope(summary, { hasChart: true, hasCode: false });

    expect(result.envelope.headline.toLowerCase()).not.toContain('executive summary');
    expect(result.envelope.insights.some((insight) => /^action:/i.test(insight))).toBe(false);
    expect(result.envelope.insights.some((insight) => /^evidence:/i.test(insight))).toBe(false);
    expect(result.envelope.insights.some((insight) => /business impact is high/i.test(insight))).toBe(true);
    expect(result.envelope.forecast).not.toMatch(/^action:/i);
  });

  it('removes envelope-only summary lines from the analysis body', () => {
    const summary = [
      'Executive Signal: Demand is improving, but margin capture still needs intervention.',
      '1) Gross margin improved by 2.1 points.',
      '2) Volume improved in the highest-conversion segment.',
      '3) Freight and discount leakage remain the main margin risk.',
      'Action: Shift spend into the best-converting priority segment.',
      'Action: Audit freight leakage on the worst lanes this week.',
      'Action: Tighten exception-based discounting before next month.',
      'Forecast: Momentum indicates incremental growth if spend remains constant.',
      'Data Quality: Stable for decision support.',
    ].join('\n');

    const { envelope } = buildAnalysisResponseEnvelope(summary, { hasChart: true, hasCode: true });
    expect(buildAnalysisBodyContent(summary, envelope)).toBe('');

    const detailed = `${summary}\n\nFreight leakage is concentrated in the west lanes.\nDiscount overrides spiked in the final week.`;
    const analysisBody = buildAnalysisBodyContent(detailed, envelope);

    expect(analysisBody).toContain('Freight leakage is concentrated in the west lanes.');
    expect(analysisBody).toContain('Discount overrides spiked in the final week.');
    expect(analysisBody).not.toContain('Executive Signal');
  });
});
