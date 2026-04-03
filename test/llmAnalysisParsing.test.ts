import { describe, expect, it } from 'vitest';
import {
  buildDeterministicAnalysisFallbackCode,
  parseAnalysisPayloadFromText,
} from '../src/services/llm';

describe('analysis payload parsing', () => {
  it('parses strict JSON payloads', () => {
    const payload = parseAnalysisPayloadFromText('{"explanation":"ok","code":"result = 1","requires_visualization":true}');

    expect(payload).toBeTruthy();
    expect(payload?.explanation).toBe('ok');
    expect(payload?.code).toContain('result = 1');
    expect(payload?.requires_visualization).toBe(true);
  });

  it('extracts JSON object from wrapped text', () => {
    const payload = parseAnalysisPayloadFromText('Here you go:\n```json\n{"explanation":"wrapped","code":"result = 2"}\n```\nThanks');

    expect(payload).toBeTruthy();
    expect(payload?.explanation).toBe('wrapped');
    expect(payload?.code).toContain('result = 2');
  });

  it('salvages fenced python output into code payload', () => {
    const payload = parseAnalysisPayloadFromText('```python\nimport pandas as pd\nresult = 3\n```');

    expect(payload).toBeTruthy();
    expect(payload?.explanation).toContain('Recovered analysis code');
    expect(payload?.code).toContain('result = 3');
  });
});

describe('deterministic analysis fallback', () => {
  it('includes executable baseline analysis code', () => {
    const code = buildDeterministicAnalysisFallbackCode(true);

    expect(code).toContain('import pandas as pd');
    expect(code).toContain('result =');
    expect(code).toContain('Deterministic fallback');
    expect(code).toContain('make_subplots');
    expect(code).toContain('Forecast');
    expect(code).toContain('Deterministic fallback dashboard');
    expect(code).toContain("'dfs' in dir()");
    expect(code).toContain('_is_usable(_candidate)');
  });
});
