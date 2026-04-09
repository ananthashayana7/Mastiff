type ChartRow = Record<string, unknown>;

interface SampleBackedFile {
  name?: string;
  filename?: string;
  metadata?: unknown;
}

function isChartRow(value: unknown): value is ChartRow {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPresentValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function isNumericLike(value: unknown): boolean {
  if (!isPresentValue(value) || typeof value === 'boolean') return false;
  return Number.isFinite(Number(value));
}

function splitInlineRow(line: string): string[] {
  const rawParts = line.includes('\t')
    ? line.split('\t')
    : line.split(/\s{2,}/);
  return rawParts.map((part) => part.trim()).filter(Boolean);
}

function parseNumericToken(token: string): number {
  const normalized = token.trim();
  if (!normalized || /^(-|—|NA|N\/A|null)$/i.test(normalized)) return 0;
  const direct = Number(normalized.replace(/,/g, ''));
  if (Number.isFinite(direct)) return direct;

  const match = normalized.match(/-?\d[\d,]*(?:\.\d+)?/);
  return match ? Number(match[0].replace(/,/g, '')) : 0;
}

function extractMonthLabels(lines: string[]): string[] {
  const monthLine = lines.find((line) => /Particulars/i.test(line) && /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(line));
  if (!monthLine) {
    return ["Jan'25", "Feb'25", "Mar'25", "Apr'25", "May'25", "Jun'25"];
  }

  const matches = monthLine.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[A-Za-z]*\s*['-]?\s*\d{2,4}/gi) || [];
  const normalized = matches
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .slice(0, 6);

  return normalized.length === 6
    ? normalized
    : ["Jan'25", "Feb'25", "Mar'25", "Apr'25", "May'25", "Jun'25"];
}

export function normalizeChartRows(input: unknown, maxRows = 24): ChartRow[] {
  if (!Array.isArray(input)) return [];
  return input.filter(isChartRow).slice(0, maxRows);
}

export function hasAutoChartableData(input: unknown): boolean {
  const rows = normalizeChartRows(input);
  if (rows.length === 0) return false;

  const headers = Object.keys(rows[0] || {});
  if (headers.length < 2) return false;

  return headers.some((header) => {
    const values = rows.map((row) => row[header]).filter(isPresentValue);
    if (values.length === 0) return false;

    const numericCount = values.filter(isNumericLike).length;
    return numericCount >= Math.max(1, Math.ceil(values.length * 0.7));
  });
}

export function buildAutoChartRowsFromFiles(files: SampleBackedFile[], maxRows = 24): ChartRow[] {
  const rows: ChartRow[] = [];
  const includeSource = files.length > 1;

  for (const file of files) {
    const metadata = file.metadata as { sample?: unknown[] } | undefined;
    const sample = Array.isArray(metadata?.sample) ? metadata.sample : [];
    const sourceName = file.filename || file.name || 'dataset';

    for (const row of sample) {
      if (!isChartRow(row)) continue;
      rows.push(includeSource ? { source_file: sourceName, ...row } : { ...row });
      if (rows.length >= maxRows) {
        return rows;
      }
    }
  }

  return rows;
}

export function buildAutoChartRowsFromInlineTable(rawContent: string, maxMetrics = 8): ChartRow[] {
  const lines = (rawContent || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const months = extractMonthLabels(lines);
  const monthlyRecords: Array<{ label: string; values: number[] }> = [];

  for (const line of lines) {
    if (/PreBo Statement of Profit and loss/i.test(line)) continue;
    if (/Particulars/i.test(line) && /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(line)) continue;

    const parts = splitInlineRow(line);
    if (parts.length === 0) continue;

    const label = parts[0].trim();
    if (!label || /^(A- Total Income|B- Total Expenses)$/i.test(label)) continue;

    let candidates = parts.slice(1).filter((part) => /^(-|—|NA|N\/A|null)$/i.test(part) || /\d/.test(part));
    if (candidates.length < 12) {
      candidates = line.match(/-?\d[\d,]*(?:\.\d+)?|\bN\/?A\b|-|—|null/gi) || [];
    }

    if (candidates.length >= 13) {
      candidates = candidates.slice(-12);
    }

    if (candidates.length < 12) continue;

    monthlyRecords.push({
      label,
      values: candidates.slice(0, 6).map(parseNumericToken),
    });
  }

  if (monthlyRecords.length === 0) return [];

  const priorityOrder = [
    'Revenue from operations',
    'Total Income',
    'Total expenses',
    'Profit before tax (EBIT)',
    'Profit for the year (PAT)',
    'Changes in inventories of finished goods and work-in-progress',
    'Other income',
    'Employee benefits expense',
    'Cost of raw material consumed',
  ];

  const prioritized = [
    ...monthlyRecords.filter((record) => priorityOrder.includes(record.label)).sort(
      (left, right) => priorityOrder.indexOf(left.label) - priorityOrder.indexOf(right.label)
    ),
    ...monthlyRecords.filter((record) => !priorityOrder.includes(record.label)),
  ].slice(0, maxMetrics);

  return months.map((month, index) => {
    const row: ChartRow = { period: month };
    for (const record of prioritized) {
      row[record.label] = record.values[index] ?? 0;
    }
    return row;
  });
}