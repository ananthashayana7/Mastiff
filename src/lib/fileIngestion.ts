import fs from 'fs/promises';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

export const TABULAR_TYPES = ['.csv', '.xlsx', '.xls', '.json', '.parquet', '.tsv'];
export const DOCUMENT_TYPES = ['.txt', '.pdf', '.docx', '.doc'];
export const ACCEPTED_TYPES = [...TABULAR_TYPES, ...DOCUMENT_TYPES];

type MetadataExtras = {
  extractionWarning?: string;
  sheetName?: string;
  sheetNames?: string[];
  headerRowIndex?: number;
  droppedEmptyRows?: number;
  droppedEmptyColumns?: number;
  schemaReviewNotes?: string[];
};

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildDocumentMetadata(
  extractedText: string,
  originalName: string,
  ext: string
): Record<string, any> {
  const lines = extractedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sample = lines.slice(0, 10).map((text, i) => ({
    line_number: i + 1,
    text,
  }));

  const words = extractedText.trim().split(/\s+/).filter(Boolean);
  const extractionWarning = lines.length === 0
    ? 'No extractable text was found in this document. You can still keep it in the session, but downstream analysis may be limited.'
    : undefined;

  return {
    row_count: lines.length,
    column_count: 2,
    document_type: ext.substring(1),
    original_filename: originalName,
    text_length: extractedText.length,
    word_count: words.length,
    extraction_warning: extractionWarning,
    schema_review_notes: extractionWarning ? ['Document contains little or no extractable text.'] : [],
    columns: {
      line_number: {
        dtype: 'int64',
        null_count: 0,
        null_percentage: 0,
        unique_count: lines.length,
        sample_values: sample.slice(0, 5).map((r) => r.line_number),
      },
      text: {
        dtype: 'object',
        null_count: 0,
        null_percentage: 0,
        unique_count: new Set(lines).size,
        sample_values: sample.slice(0, 5).map((r) => r.text),
      },
    },
    sample,
  };
}

function detectDelimiter(lines: string[]): string {
  const candidates = [',', ';', '\t', '|'];
  let selected = ',';
  let selectedScore = -1;

  for (const candidate of candidates) {
    const score = lines.reduce((total, line) => total + Math.max(0, line.split(candidate).length - 1), 0);
    if (score > selectedScore) {
      selected = candidate;
      selectedScore = score;
    }
  }

  return selected;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"(.*)"$/, '$1').trim());
}

function parseScalar(rawValue: string): any {
  const value = String(rawValue ?? '').trim();
  if (!value) return null;

  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === 'true';
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }

  return value;
}

function normalizeHeader(value: string, index: number): string {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  return normalized || `column_${index + 1}`;
}

function buildColumnMetadata(
  rows: Record<string, any>[],
  headers: string[]
): Record<string, any> {
  const columns: Record<string, any> = {};

  for (const header of headers) {
    const values = rows.map((row) => row[header]);
    const nonNullValues = values.filter(
      (value) => value !== null && value !== undefined && String(value).trim() !== ''
    );

    const nullCount = values.length - nonNullValues.length;
    const uniqueCount = new Set(nonNullValues.map((value) => JSON.stringify(value))).size;

    const isBoolean =
      nonNullValues.length > 0 &&
      nonNullValues.every((value) => typeof value === 'boolean');

    const isNumeric =
      nonNullValues.length > 0 &&
      nonNullValues.every((value) => typeof value === 'number' && Number.isFinite(value));

    columns[header] = {
      dtype: isBoolean ? 'bool' : isNumeric ? 'float64' : 'object',
      null_count: nullCount,
      null_percentage: rows.length > 0 ? Number(((nullCount / rows.length) * 100).toFixed(2)) : 0,
      unique_count: uniqueCount,
      sample_values: nonNullValues.slice(0, 5),
    };
  }

  return columns;
}

function hasNonEmptyCell(cell: unknown): boolean {
  if (cell === null || cell === undefined) return false;
  if (typeof cell === 'string') return cell.trim() !== '';
  return true;
}

function normalizeGridCell(value: unknown): unknown {
  if (!hasNonEmptyCell(value)) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function countNonEmptyCells(values: unknown[]): number {
  return values.filter((value) => hasNonEmptyCell(value)).length;
}

function trimEmptyGridColumns(grid: unknown[][]): { grid: unknown[][]; droppedCount: number } {
  if (grid.length === 0) {
    return { grid: [], droppedCount: 0 };
  }

  const maxWidth = Math.max(...grid.map((row) => row.length), 0);
  if (maxWidth === 0) {
    return { grid: [], droppedCount: 0 };
  }

  const keptIndexes = Array.from({ length: maxWidth }, (_, index) => index).filter((index) =>
    grid.some((row) => hasNonEmptyCell(row[index]))
  );

  const trimmedGrid = grid.map((row) => keptIndexes.map((index) => row[index] ?? null));
  return {
    grid: trimmedGrid,
    droppedCount: Math.max(0, maxWidth - keptIndexes.length),
  };
}

function scoreHeaderCandidate(row: unknown[], nextRows: unknown[][]): number {
  const values = row
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  if (values.length < 2) {
    return -1;
  }

  const uniqueRatio = new Set(values.map((value) => value.toLowerCase())).size / values.length;
  const numericLikeCount = values.filter((value) => /^-?\d+(\.\d+)?$/.test(value)).length;
  const numericPenalty = numericLikeCount / values.length;
  const placeholderPenalty = values.filter((value) => /^(column_\d+|unnamed:?\s*\d*)$/i.test(value)).length / values.length;
  const nextRowDensity = nextRows.length > 0
    ? nextRows
      .slice(0, 3)
      .reduce((sum, candidate) => sum + countNonEmptyCells(candidate), 0) / Math.min(nextRows.length, 3)
    : 0;

  return (values.length * 2.2) + (uniqueRatio * 5) + nextRowDensity - (numericPenalty * 6) - (placeholderPenalty * 4);
}

function detectHeaderRowIndex(grid: unknown[][]): number {
  let bestIndex = 0;
  let bestScore = -Infinity;
  const scanLimit = Math.min(12, grid.length);

  for (let index = 0; index < scanLimit; index += 1) {
    const candidate = grid[index];
    if (!Array.isArray(candidate)) continue;
    const score = scoreHeaderCandidate(candidate, grid.slice(index + 1));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestScore >= 2 ? bestIndex : 0;
}

function mapGridRowsToObjects(headers: string[], dataRows: unknown[][]): Record<string, any>[] {
  return dataRows
    .filter((line) => Array.isArray(line) && line.some((cell) => hasNonEmptyCell(cell)))
    .map((line) => {
      const row: Record<string, any> = {};
      headers.forEach((header, index) => {
        row[header] = normalizeGridCell(line[index]);
      });
      return row;
    });
}

function removeEmptyColumns(
  headers: string[],
  rows: Record<string, any>[]
): { headers: string[]; rows: Record<string, any>[]; droppedCount: number } {
  const keptHeaders = headers.filter((header) =>
    rows.some((row) => hasNonEmptyCell(row[header]))
  );

  if (keptHeaders.length === 0) {
    return {
      headers,
      rows,
      droppedCount: 0,
    };
  }

  return {
    headers: keptHeaders,
    rows: rows.map((row) => Object.fromEntries(keptHeaders.map((header) => [header, row[header] ?? null]))),
    droppedCount: Math.max(0, headers.length - keptHeaders.length),
  };
}

function finalizeTabularMetadata(
  originalName: string,
  headers: string[],
  rows: Record<string, any>[],
  extras: MetadataExtras = {}
): Record<string, any> {
  const normalizedRows = rows.filter((row) =>
    Object.values(row).some((value) => hasNonEmptyCell(value))
  );
  const effectiveHeaders = headers.length > 0
    ? headers
    : (normalizedRows[0] ? Object.keys(normalizedRows[0]) : []);
  const normalized = removeEmptyColumns(effectiveHeaders, normalizedRows);
  const schemaReviewNotes = [
    ...(extras.schemaReviewNotes || []),
    extras.droppedEmptyRows ? `Removed ${extras.droppedEmptyRows} fully empty row${extras.droppedEmptyRows === 1 ? '' : 's'} during normalization.` : '',
    extras.droppedEmptyColumns ? `Removed ${extras.droppedEmptyColumns} fully empty column${extras.droppedEmptyColumns === 1 ? '' : 's'} during normalization.` : '',
  ].filter(Boolean);

  return {
    row_count: normalized.rows.length,
    column_count: normalized.headers.length,
    original_filename: originalName,
    extraction_mode: 'fallback',
    extraction_warning: extras.extractionWarning,
    sheet_name: extras.sheetName,
    sheet_names: extras.sheetNames,
    header_row_index: extras.headerRowIndex,
    dropped_empty_rows: extras.droppedEmptyRows || 0,
    dropped_empty_columns: (extras.droppedEmptyColumns || 0) + normalized.droppedCount,
    schema_review_notes: schemaReviewNotes,
    columns: buildColumnMetadata(normalized.rows, normalized.headers),
    sample: normalized.rows.slice(0, 10),
  };
}

function buildSpreadsheetMetadata(grid: unknown[][], originalName: string, extras: MetadataExtras = {}): Record<string, any> {
  const nonEmptyRows = grid.filter((line) => Array.isArray(line) && line.some((cell) => hasNonEmptyCell(cell)));
  const droppedEmptyRows = Math.max(0, grid.length - nonEmptyRows.length);
  const trimmed = trimEmptyGridColumns(nonEmptyRows);
  const compactGrid = trimmed.grid;

  if (compactGrid.length === 0) {
    return finalizeTabularMetadata(originalName, [], [], {
      ...extras,
      droppedEmptyRows,
      droppedEmptyColumns: trimmed.droppedCount,
      extractionWarning: extras.extractionWarning || 'The workbook contains no usable populated rows after removing empty spacers.',
      schemaReviewNotes: [
        ...(extras.schemaReviewNotes || []),
        'Spreadsheet appears to contain only empty spacer rows or formatting shells.',
      ],
    });
  }

  if (compactGrid.length === 1) {
    const widestRow = compactGrid[0].length;
    const headers = Array.from({ length: widestRow }, (_, index) => normalizeHeader('', index));
    const rows = mapGridRowsToObjects(headers, compactGrid);
    return finalizeTabularMetadata(originalName, headers, rows, {
      ...extras,
      droppedEmptyRows,
      droppedEmptyColumns: trimmed.droppedCount,
      headerRowIndex: 0,
      schemaReviewNotes: [
        ...(extras.schemaReviewNotes || []),
        'Single-row sheet detected, so Mastiff treated the row as data instead of assuming it was a header.',
      ],
    });
  }

  const headerRowIndex = detectHeaderRowIndex(compactGrid);
  const headerRow = compactGrid[headerRowIndex] || [];
  const headers = headerRow.map((value, index) => normalizeHeader(String(value ?? ''), index));
  const dataRows = compactGrid.slice(headerRowIndex + 1);
  const mappedRows = mapGridRowsToObjects(headers, dataRows);

  if (mappedRows.length === 0) {
    const fallbackHeaders = Array.from({ length: compactGrid[0]?.length || 0 }, (_, index) => normalizeHeader('', index));
    return finalizeTabularMetadata(originalName, fallbackHeaders, mapGridRowsToObjects(fallbackHeaders, compactGrid), {
      ...extras,
      droppedEmptyRows,
      droppedEmptyColumns: trimmed.droppedCount,
      headerRowIndex,
      schemaReviewNotes: [
        ...(extras.schemaReviewNotes || []),
        'No rows remained below the inferred header, so Mastiff treated the visible grid as data to avoid a false empty upload.',
      ],
    });
  }

  return finalizeTabularMetadata(originalName, headers, mappedRows, {
    ...extras,
    droppedEmptyRows,
    droppedEmptyColumns: trimmed.droppedCount,
    headerRowIndex,
  });
}

function buildDelimitedMetadata(lines: string[], delimiter: string, originalName: string): Record<string, any> {
  const parsedLines = lines
    .map((line) => splitDelimitedLine(line, delimiter))
    .filter((values) => values.some((value) => value.trim().length > 0));

  if (parsedLines.length === 0) {
    return finalizeTabularMetadata(originalName, [], [], {
      extractionWarning: 'The delimited file did not contain any non-empty rows after normalization.',
    });
  }

  if (parsedLines.length === 1) {
    const headers = parsedLines[0].map((_, index) => normalizeHeader('', index));
    const rows = parsedLines.map((values) => {
      const row: Record<string, any> = {};
      headers.forEach((header, index) => {
        row[header] = parseScalar(values[index] ?? '');
      });
      return row;
    });
    return finalizeTabularMetadata(originalName, headers, rows, {
      headerRowIndex: 0,
      schemaReviewNotes: ['Single populated row detected, so Mastiff treated the line as data rather than as a header.'],
    });
  }

  const grid = parsedLines.map((line) => line.map((value) => value.trim()));
  const headerRowIndex = detectHeaderRowIndex(grid);
  const headers = (grid[headerRowIndex] || []).map((value, index) => normalizeHeader(value, index));
  const dataLines = grid.slice(headerRowIndex + 1);
  const rows = dataLines.map((values) => {
    const row: Record<string, any> = {};
    headers.forEach((header, index) => {
      row[header] = parseScalar(values[index] ?? '');
    });
    return row;
  });

  return finalizeTabularMetadata(originalName, headers, rows, { headerRowIndex });
}

export async function buildTabularMetadataFallback(
  filePath: string,
  originalName: string,
  ext: string
): Promise<Record<string, any>> {
  try {
    if (ext === '.json') {
      const rawJson = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(rawJson);

      let records: any[] = [];
      if (Array.isArray(parsed)) {
        records = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const firstArrayValue = Object.values(parsed).find((value) => Array.isArray(value));
        records = Array.isArray(firstArrayValue) ? firstArrayValue : [parsed];
      }

      const objectRows = records
        .filter((value) => value && typeof value === 'object' && !Array.isArray(value))
        .map((value) => value as Record<string, any>);

      const headers = Array.from(new Set(objectRows.flatMap((row) => Object.keys(row))));
      const rows = objectRows.map((row) => Object.fromEntries(headers.map((header) => [header, row[header] ?? null])));
      return finalizeTabularMetadata(originalName, headers, rows);
    }

    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = xlsx.readFile(filePath, { cellDates: true });
      let bestSheetName = workbook.SheetNames[0] || 'Sheet1';
      let bestGrid: unknown[][] = [];
      let bestScore = -1;

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const grid = xlsx.utils.sheet_to_json<any[]>(sheet, {
          header: 1,
          defval: null,
          raw: false,
        }) as unknown[][];
        const compactRows = grid.filter((row) => Array.isArray(row) && row.some((cell) => hasNonEmptyCell(cell)));
        const score = compactRows.reduce((sum, row) => sum + countNonEmptyCells(row), 0);

        if (score > bestScore) {
          bestScore = score;
          bestSheetName = sheetName;
          bestGrid = grid;
        }
      }

      return buildSpreadsheetMetadata(bestGrid, originalName, {
        sheetName: bestSheetName,
        sheetNames: workbook.SheetNames,
        schemaReviewNotes: workbook.SheetNames.length > 1
          ? [`Selected "${bestSheetName}" as the most data-rich sheet out of ${workbook.SheetNames.length} tabs.`]
          : [],
      });
    }

    if (ext === '.parquet') {
      return finalizeTabularMetadata(originalName, [], [], {
        extractionWarning: 'Parquet fallback parser is unavailable without Python parquet dependencies.',
      });
    }

    const rawBuffer = await fs.readFile(filePath);
    let text = rawBuffer.toString('utf-8');
    if (text.includes('\uFFFD')) {
      text = rawBuffer.toString('latin1');
    }

    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const delimiter = ext === '.tsv' ? '\t' : detectDelimiter(lines.slice(0, 20));
    return buildDelimitedMetadata(lines, delimiter, originalName);
  } catch (error: any) {
    return finalizeTabularMetadata(originalName, [], [], {
      extractionWarning: error?.message || 'Fallback metadata extraction failed',
    });
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;
  const chunks: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const pageText = (content.items || [])
      .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .trim();

    if (pageText) {
      chunks.push(pageText);
    }
  }

  return chunks.join('\n\n');
}

export async function extractDocumentText(buffer: Buffer, ext: string): Promise<string> {
  if (ext === '.txt' || ext === '.doc') {
    return buffer.toString('utf-8');
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (ext === '.pdf') {
    return extractPdfText(buffer);
  }

  return '';
}
