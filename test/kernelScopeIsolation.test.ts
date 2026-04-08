import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { kernelService } from '../src/services/kernel';

const tempDirs: string[] = [];

async function createCsvFile(filename: string, content: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mastiff-kernel-scope-'));
  const filePath = path.join(tempDir, filename);
  await fs.writeFile(filePath, content, 'utf-8');
  tempDirs.push(tempDir);
  return filePath;
}

afterEach(async () => {
  kernelService.terminateAll();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('kernel dataset scope isolation', () => {
  it(
    'exposes only the currently requested files inside dfs between runs',
    async () => {
      const sessionId = `kernel-scope-${randomUUID()}`;
      const alphaPath = await createCsvFile('alpha.csv', 'line,rejects\nA,3\n');
      const betaPath = await createCsvFile('beta.csv', 'line,rejects\nB,7\n');

      const firstResponse = await kernelService.execute(
        sessionId,
        `
result = {"active_files": sorted([key for key in dfs.keys() if key.endswith(".csv")])}
`,
        [{ id: 'alpha', name: 'alpha.csv', path: alphaPath }]
      );

      expect(firstResponse.success).toBe(true);
      expect(firstResponse.result).toContain('alpha.csv');
      expect(firstResponse.result).not.toContain('beta.csv');

      const secondResponse = await kernelService.execute(
        sessionId,
        `
result = {"active_files": sorted([key for key in dfs.keys() if key.endswith(".csv")])}
`,
        [{ id: 'beta', name: 'beta.csv', path: betaPath }]
      );

      expect(secondResponse.success).toBe(true);
      expect(secondResponse.result).toContain('beta.csv');
      expect(secondResponse.result).not.toContain('alpha.csv');
    },
    300000
  );
});
