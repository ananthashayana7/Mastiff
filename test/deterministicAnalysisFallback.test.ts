import { describe, expect, it } from 'vitest';

import { buildDeterministicAnalysisFallbackPython } from '../src/services/deterministicAnalysisFallback';

describe('deterministic analysis fallback', () => {
  it('includes finance bridge and scenario visuals in the fallback dashboard', () => {
    const python = buildDeterministicAnalysisFallbackPython(true);

    expect(python).toContain('go.Waterfall(');
    expect(python).toContain('Forecast scenario comparison');
    expect(python).toContain('PAT bridge');
    expect(python).toContain('Hidden risk:');
    expect(python).toContain("particular|description|line item|account|metric|category|item");
    expect(python).toContain('_structure_looks_financial');
    expect(python).toContain('_total_income_row is None or _pat_row is None');
    expect(python).toContain("fig.update_xaxes(title_text='Month', row=1, col=1)");
    expect(python).toContain("title=dict(text=f'Financial statement dashboard: {source_name}'");
    expect(python).toContain('def _pick_datetime_axis');
    expect(python).toContain('def _pick_driver_dimension');
    expect(python).toContain("'timeAxis': str(time_col) if time_col else None");
    expect(python).toContain("Deterministic fallback dashboard: {value_col} operating analysis");
  });
});