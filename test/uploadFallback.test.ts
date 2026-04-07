import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as xlsx from 'xlsx';

vi.mock('@/db', () => ({
  db: {},
}));

vi.mock('@/db/schema', () => ({
  files: {},
}));

import { buildTabularMetadataFallback } from '../src/lib/fileIngestion';

const tempFiles: string[] = [];

async function createWorkbookFile(rows: any[][]): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mastiff-xlsx-'));
  const filePath = path.join(tempDir, 'sample.xlsx');
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  xlsx.writeFile(workbook, filePath);
  tempFiles.push(filePath);
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    tempFiles.splice(0).map(async (filePath) => {
      await fs.rm(path.dirname(filePath), { recursive: true, force: true });
    })
  );
});

describe('buildTabularMetadataFallback', () => {
  it('reads regular xlsx sheets with headers and data rows', async () => {
    const filePath = await createWorkbookFile([
      ['Reason', 'RejectedQty'],
      ['Warp', 4],
      ['Scratch', 2],
    ]);

    const metadata = await buildTabularMetadataFallback(filePath, 'rejections.xlsx', '.xlsx');

    expect(metadata.row_count).toBe(2);
    expect(metadata.column_count).toBe(2);
    expect(metadata.sample).toEqual([
      { Reason: 'Warp', RejectedQty: '4' },
      { Reason: 'Scratch', RejectedQty: '2' },
    ]);
  });

  it('keeps single-row xlsx data instead of collapsing it to zero rows', async () => {
    const filePath = await createWorkbookFile([
      ['S4 Line Rejection', 12, 'Critical'],
    ]);

    const metadata = await buildTabularMetadataFallback(filePath, 'S4_LineRejection.xlsx', '.xlsx');

    expect(metadata.row_count).toBe(1);
    expect(metadata.column_count).toBe(3);
    expect(metadata.sample).toEqual([
      { column_1: 'S4 Line Rejection', column_2: '12', column_3: 'Critical' },
    ]);
  });
});
