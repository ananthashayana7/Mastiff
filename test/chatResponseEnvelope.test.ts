import { describe, expect, it } from 'vitest';
import {
  buildAnalysisResponseEnvelope,
  renderEnvelopeAsSummary,
} from '../src/lib/chatResponseEnvelope';

describe('chat response envelope', () => {
  it('accepts valid 3-bullet + forecast summary without fallback', () => {
    const summary = [
      '1) Revenue increased 12% QoQ in the north region.',
      '2) Data quality is acceptable with <1% null rates in key fields.',
      '3) Prioritize inventory in top-performing SKUs for margin protection.',
      'Forecast: Current trend suggests continued mid-single-digit growth next quarter.',
    ].join('\n');

    const result = buildAnalysisResponseEnvelope(summary, { hasChart: true, hasCode: true });
    expect(result.usedFallback).toBe(false);
    expect(result.envelope.insights).toHaveLength(3);
    expect(result.envelope.forecast).toContain('Forecast');
  });

  it('falls back to deterministic envelope when structure is missing', () => {
    const summary = 'General narrative with no bullets and no explicit forecast sentence.';
    const result = buildAnalysisResponseEnvelope(summary, { hasChart: false, hasCode: true });

    expect(result.usedFallback).toBe(true);
    expect(result.envelope.insights).toHaveLength(3);
    expect(result.envelope.forecast.length).toBeGreaterThan(10);
  });

  it('renders envelope into compact summary format', () => {
    const summary = [
      '1) Gross margin improved by 2.1 points.',
      '2) Data quality is stable for decision support.',
      '3) Expand high-conversion campaigns in priority segments.',
      'Forecast: Momentum indicates incremental growth if spend remains constant.',
    ].join('\n');

    const { envelope } = buildAnalysisResponseEnvelope(summary, { hasChart: true, hasCode: true });
    const rendered = renderEnvelopeAsSummary(envelope);

    expect(rendered).toContain('1) ');
    expect(rendered).toContain('2) ');
    expect(rendered).toContain('3) ');
    expect(rendered).toContain('Forecast: ');
  });
});
