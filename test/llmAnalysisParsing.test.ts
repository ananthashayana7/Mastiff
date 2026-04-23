import { describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import {
  buildDeterministicAnalysisFallbackCode,
  buildResilientDeterministicAnalysisFallbackCode,
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
    expect(code).toContain("'dfs' in globals()");
    expect(code).toContain('_is_usable(_candidate)');
    expect(code).toContain("['load_error']");
  });

  it('includes resilient finance-aware fallback code for live analysis use', () => {
    const code = buildResilientDeterministicAnalysisFallbackCode(true);

    expect(code).toContain('__SPARTA_SIGNAL__=');
    expect(code).toContain('financial_statement');
    expect(code).toContain('Deterministic fallback dashboard');
    expect(code).toContain('_collect_usable_dfs');
    expect(code).toContain('_build_financial_statement_output');
  });

  it('produces resilient fallback python that compiles cleanly', () => {
    const code = buildResilientDeterministicAnalysisFallbackCode(true);
    const commands: Array<{ cmd: string; args: string[] }> = [
      { cmd: 'py', args: ['-3', '-c', 'import sys; compile(sys.stdin.read(), "<fallback>", "exec")'] },
      { cmd: 'python', args: ['-c', 'import sys; compile(sys.stdin.read(), "<fallback>", "exec")'] },
      { cmd: 'python3', args: ['-c', 'import sys; compile(sys.stdin.read(), "<fallback>", "exec")'] },
    ];

    let attempted = false;

    for (const candidate of commands) {
      const result = spawnSync(candidate.cmd, candidate.args, {
        input: code,
        encoding: 'utf-8',
      });

      if (result.error && ['ENOENT', 'UNKNOWN'].includes(String((result.error as NodeJS.ErrnoException).code || ''))) {
        continue;
      }

      attempted = true;
      expect(result.status).toBe(0);
      expect(result.stderr || '').toBe('');
      break;
    }

    if (!attempted) {
      expect(code.length).toBeGreaterThan(1000);
    }
  });
});
