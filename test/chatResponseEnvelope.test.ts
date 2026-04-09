import { describe, expect, it } from 'vitest';
import {
  buildAnalysisResponseEnvelope,
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
      '→ Action: Tighten freight surcharge recovery on the worst-affected lanes.',
      '→ Action: Rebalance inventory toward the highest-margin SKUs this cycle.',
      '→ Action: Review discount exceptions weekly until contribution stabilizes.',
      'Forecast: Current trend suggests continued mid-single-digit growth next quarter.',
      'Data Quality: Reliable for directional decisions; null rates remain below 1% in key fields.',
    ].join('\n');

    const result = buildAnalysisResponseEnvelope(summary, { hasChart: true, hasCode: true });
    expect(result.usedFallback).toBe(false);
    expect(result.envelope.headline).toContain('Margin held');
    expect(result.envelope.insights).toHaveLength(4);
    expect(result.envelope.actions).toHaveLength(3);
    expect(result.envelope.forecast).toContain('Forecast');
    expect(result.envelope.dataQuality).toContain('Data Quality');
  });

  it('falls back to deterministic envelope when structure is missing', () => {
    const summary = 'General narrative with no bullets and no explicit forecast sentence.';
    const result = buildAnalysisResponseEnvelope(summary, { hasChart: false, hasCode: true });

    expect(result.usedFallback).toBe(true);
    expect(result.envelope.insights.length).toBeGreaterThanOrEqual(3);
    expect(result.envelope.actions).toHaveLength(3);
    expect(result.envelope.forecast.length).toBeGreaterThan(10);
  });

  it('renders envelope into compact summary format', () => {
    const summary = [
      'Executive Signal: Demand is improving, but margin capture still needs intervention.',
      '1) Gross margin improved by 2.1 points.',
      '2) Volume improved in the highest-conversion segment.',
      '3) Freight and discount leakage remain the main margin risk.',
      '4) Reinvestment should follow the strongest contribution pockets only.',
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
    expect(prompts.some((prompt) => prompt.includes('30-60-90 day execution plan'))).toBe(true);
  });
});
