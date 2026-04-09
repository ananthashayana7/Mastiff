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

import { buildTabularMetadataFallback, preferRicherTabularMetadata } from '../src/lib/fileIngestion';

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

  it('skips title rows and picks the richer header row in messy xlsx sheets', async () => {
    const filePath = await createWorkbookFile([
      ['Assembly Line Dashboard', null, null],
      [null, null, null],
      ['Shift', 'RejectedQty', 'YieldPct'],
      ['Shift 1', 4, 98],
      ['Shift 2', 7, 96],
    ]);

    const metadata = await buildTabularMetadataFallback(filePath, 'assembly-line.xlsx', '.xlsx');

    expect(metadata.row_count).toBe(2);
    expect(metadata.column_count).toBe(3);
    expect(metadata.header_row_index).toBe(1);
    expect(metadata.dropped_empty_rows).toBeGreaterThanOrEqual(1);
    expect(metadata.sample).toEqual([
      { Shift: 'Shift 1', RejectedQty: '4', YieldPct: '98' },
      { Shift: 'Shift 2', RejectedQty: '7', YieldPct: '96' },
    ]);
  });

  it('prefers fallback metadata when the primary extraction is effectively empty', () => {
    const preferred = preferRicherTabularMetadata(
      {
        row_count: 0,
        column_count: 0,
        sample: [],
        schema_review_notes: ['Primary extractor returned no usable rows.'],
      },
      {
        row_count: 4,
        column_count: 3,
        sample: [{ Shift: 'A', RejectedQty: '4', YieldPct: '98' }],
        schema_review_notes: ['Fallback recovered rows after removing spacer columns.'],
      }
    );

    expect(preferred.row_count).toBe(4);
    expect(preferred.column_count).toBe(3);
    expect(preferred.schema_review_notes).toContain('Fallback recovered rows after removing spacer columns.');
    expect(preferred.schema_review_notes).toContain('Fallback parser replaced a weaker metadata extraction result to preserve usable rows and columns.');
  });
});
