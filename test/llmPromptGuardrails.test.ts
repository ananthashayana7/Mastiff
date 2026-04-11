import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

describe('LLM prompt guardrails', () => {
  it('includes numeric coercion guidance before ranking operations', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/services/llm.ts'), 'utf-8');

    expect(source).toContain("Before using ranking helpers such as nlargest, nsmallest, idxmax, idxmin, or percentile logic");
    expect(source).toContain("Never call Series.nlargest(...) or Series.nsmallest(...) on raw object/string columns");
    expect(source).toContain("Cannot use method 'nlargest' with dtype object");
  });

  it('keeps the executive summary prompt aligned with an insights-first narrative', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/services/llm.ts'), 'utf-8');

    expect(source).toContain('INSIGHT-FIRST IN REPORTING');
    expect(source).toContain('Name the primary metric or dataset inside the forecast line');
    expect(source).toContain('The UI will present insights and actions before charts');
  });
});
