import fs from 'fs/promises';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

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

  return {
    row_count: lines.length,
    column_count: 2,
    document_type: ext.substring(1),
    original_filename: originalName,
    text_length: extractedText.length,
    word_count: words.length,
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
  const normalized = String(value ?? '').trim();
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
  return cell !== null && cell !== undefined && String(cell).trim() !== '';
}

function mapGridRowsToObjects(headers: string[], dataRows: any[][]): Record<string, any>[] {
  return dataRows
    .filter((line) => Array.isArray(line) && line.some((cell) => hasNonEmptyCell(cell)))
    .map((line) => {
      const row: Record<string, any> = {};
      headers.forEach((header, index) => {
        const value = line[index];
        row[header] = value === undefined || value === '' ? null : value;
      });
      return row;
    });
}

export async function buildTabularMetadataFallback(
  filePath: string,
  originalName: string,
  ext: string
): Promise<Record<string, any>> {
  try {
    let headers: string[] = [];
    let rows: Record<string, any>[] = [];

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

      headers = Array.from(new Set(objectRows.flatMap((row) => Object.keys(row))));
      rows = objectRows.map((row) => {
        const normalized: Record<string, any> = {};
        headers.forEach((header) => {
          normalized[header] = row[header] ?? null;
        });
        return normalized;
      });
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = xlsx.readFile(filePath, { cellDates: true });
      let bestGrid: any[][] = [];
      let bestScore = -1;

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const grid = xlsx.utils.sheet_to_json<any[]>(sheet, {
          header: 1,
          defval: null,
          raw: false,
        }) as any[][];

        const score = grid.length * (grid[0]?.length || 0);
        if (score > bestScore) {
          bestGrid = grid;
          bestScore = score;
        }
      }

      const nonEmptyRows = bestGrid.filter(
        (line) => Array.isArray(line) && line.some((cell) => hasNonEmptyCell(cell))
      );
      const [headerRow = [], ...dataRows] = nonEmptyRows;
      headers = headerRow.map((cell, index) => normalizeHeader(String(cell ?? ''), index));
      rows = mapGridRowsToObjects(headers, dataRows);

      if (rows.length === 0 && nonEmptyRows.length > 0) {
        const widestRow = Math.max(...nonEmptyRows.map((line) => line.length), 0);
        headers = Array.from({ length: widestRow }, (_, index) => normalizeHeader('', index));
        rows = mapGridRowsToObjects(headers, nonEmptyRows);
      }
    } else if (ext === '.parquet') {
      return {
        row_count: 0,
        column_count: 0,
        original_filename: originalName,
        extraction_mode: 'fallback',
        extraction_warning: 'Parquet fallback parser is unavailable without Python parquet dependencies.',
        columns: {},
        sample: [],
      };
    } else {
      const rawBuffer = await fs.readFile(filePath);
      let text = rawBuffer.toString('utf-8');
      if (text.includes('\uFFFD')) {
        text = rawBuffer.toString('latin1');
      }

      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const delimiter = ext === '.tsv' ? '\t' : detectDelimiter(lines.slice(0, 20));

      const [headerLine = '', ...dataLines] = lines;
      headers = splitDelimitedLine(headerLine, delimiter).map((value, index) =>
        normalizeHeader(value, index)
      );

      rows = dataLines
        .map((line) => splitDelimitedLine(line, delimiter))
        .filter((values) => values.some((value) => value.trim().length > 0))
        .map((values) => {
          const row: Record<string, any> = {};
          headers.forEach((header, index) => {
            row[header] = parseScalar(values[index] ?? '');
          });
          return row;
        });
    }

    if (headers.length === 0 && rows.length > 0) {
      headers = Object.keys(rows[0]);
    }

    return {
      row_count: rows.length,
      column_count: headers.length,
      original_filename: originalName,
      extraction_mode: 'fallback',
      columns: buildColumnMetadata(rows, headers),
      sample: rows.slice(0, 10),
    };
  } catch (error: any) {
    return {
      row_count: 0,
      column_count: 0,
      original_filename: originalName,
      extraction_mode: 'fallback',
      extraction_warning: error?.message || 'Fallback metadata extraction failed',
      columns: {},
      sample: [],
    };
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
