import { describe, expect, it } from 'vitest';
import {
  buildContractFallbackSummary,
  validateSummaryContract,
} from '../src/lib/chatResponseContract';

describe('chat response contract helpers', () => {
  it('detects required bullet contract violations', () => {
    const result = validateSummaryContract(
      'Provide EXACTLY 3 crisp, actionable bullet points.',
      'Only one line response.',
      false,
      true
    );

    expect(result.valid).toBe(false);
    expect(result.violations).toContain('missing_required_bullets');
  });

  it('detects intro text when prompt forbids introductions', () => {
    const result = validateSummaryContract(
      'STRICT RULE: NO introductory text. Start immediately.',
      'Hello team\n1) Insight\n2) Reliability\n3) Action',
      false,
      true
    );

    expect(result.valid).toBe(false);
    expect(result.violations).toContain('intro_text_present');
  });

  it('enforces missing code for numeric intent', () => {
    const result = validateSummaryContract(
      'Analyze trend and forecast with chart.',
      '1) Trend is positive\n2) Data quality good\n3) Increase investment',
      true,
      false
    );

    expect(result.valid).toBe(false);
    expect(result.violations).toContain('missing_code_for_numeric_intent');
  });

  it('builds deterministic fallback with 3 bullets when requested', () => {
    const fallback = buildContractFallbackSummary(
      'Provide EXACTLY 3 bullets and include chart.',
      true,
      true
    );

    expect(fallback.split(/\r?\n/)).toHaveLength(3);
    expect(fallback).toContain('1) Key insight');
    expect(fallback).toContain('2) Reliability');
    expect(fallback).toContain('3) Recommended action');
  });
});
