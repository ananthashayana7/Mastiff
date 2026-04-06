import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { buildRecoverySnippet } from '../src/app/api/chat/recoverySnippets';

/**
 * Resolve a working Python interpreter across Windows / Linux / macOS.
 * Preference order: py (Windows launcher), python3, python.
 * Returns null if none is found.
 */
function resolvePythonInterpreter(): string | null {
  for (const candidate of ['py', 'python3', 'python']) {
    const probe = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const PYTHON = resolvePythonInterpreter();

function expectPythonToCompile(code: string) {
  if (!PYTHON) {
    throw new Error('No Python interpreter found (tried py, python3, python). Cannot compile-check generated code.');
  }

  const result = spawnSync(PYTHON, ['-c', 'import sys; compile(sys.stdin.read(), "<generated>", "exec")'], {
    input: `import pandas as pd\n\ndfs = {}\ndf = None\n${code}\n`,
    encoding: 'utf8',
  });

  expect(result.status, result.stderr || result.stdout).toBe(0);
}

describe('buildRecoverySnippet', () => {
  it('generates valid Python for xlsx recovery when filenames contain braces, quotes, and leading digits', () => {
    const snippet = buildRecoverySnippet({
      filename: `1774177089423-S4_{Line}'Rejection.xlsx`,
      filePath: String.raw`C:\Netflix\Mastiff\uploads\1774177089423-S4_{Line}'Rejection.xlsx`,
    });

    expect(snippet).toContain(`dfs["1774177089423-S4_{Line}'Rejection.xlsx"] = _rdf`);
    expect(snippet).toContain(`print("Recovered " + str(len(_rdf)) + " rows from " + "1774177089423-S4_{Line}'Rejection.xlsx")`);
    expectPythonToCompile(snippet);
  });

  it('generates valid Python for csv recovery snippets', () => {
    const snippet = buildRecoverySnippet({
      filename: '95-rejections{daily}.csv',
      filePath: '/uploads/95-rejections{daily}.csv',
    });

    expect(snippet).toContain(`pd.read_csv("/uploads/95-rejections{daily}.csv", encoding=_enc)`);
    expectPythonToCompile(snippet);
  });

  it('generates valid Python for json recovery snippets', () => {
    const snippet = buildRecoverySnippet({
      filename: 'data.json',
      filePath: '/uploads/data.json',
    });

    expect(snippet).toContain('pd.read_json');
    expect(snippet).toContain('dfs["data.json"] = _rdf');
    expectPythonToCompile(snippet);
  });

  it('generates valid Python for parquet recovery snippets', () => {
    const snippet = buildRecoverySnippet({
      filename: 'report.parquet',
      filePath: '/uploads/report.parquet',
    });

    expect(snippet).toContain('pd.read_parquet');
    expect(snippet).toContain('dfs["report.parquet"] = _rdf');
    expectPythonToCompile(snippet);
  });

  it('returns empty string for unsupported file types', () => {
    const snippet = buildRecoverySnippet({
      filename: 'image.png',
      filePath: '/uploads/image.png',
    });

    expect(snippet).toBe('');
  });
});
