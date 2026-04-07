import type { ChatMessage } from '../types';

export type NotebookCellType = 'code' | 'markdown';
export type NotebookCellStatus = 'idle' | 'running' | 'completed' | 'error';

export interface NotebookCellOutput {
  outputType: 'text' | 'error' | 'plotly' | 'image' | 'table';
  label?: string;
  text?: string;
  data?: unknown;
}

export interface NotebookCell {
  id: string;
  cellType: NotebookCellType;
  cellIndex: number;
  source: string;
  executionCount?: number;
  outputs?: NotebookCellOutput[];
  status?: NotebookCellStatus;
  errorMessage?: string;
  executionTimeMs?: number;
}

export interface NotebookDraft {
  title: string;
  description?: string;
  cells: NotebookCell[];
  sessionId?: string | null;
  tags?: string;
  isPublic?: boolean;
}

interface BuildNotebookFromAnalysisOptions {
  sessionId?: string | null;
  sessionTitle?: string | null;
  message: Pick<ChatMessage, 'content' | 'code' | 'persona'>;
  datasetNames?: string[];
  userPrompt?: string;
}

const DEFAULT_NOTEBOOK_TITLE = 'Untitled Notebook';

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clampTitle(title: string): string {
  const cleaned = title.replace(/\s+/g, ' ').trim();
  if (!cleaned) return DEFAULT_NOTEBOOK_TITLE;
  return cleaned.slice(0, 80);
}

export function normalizeNotebookCells(cells: Partial<NotebookCell>[] = []): NotebookCell[] {
  const normalized = cells.map((cell, index) => ({
    id: cell.id || generateId('cell'),
    cellType: cell.cellType === 'markdown' ? 'markdown' : 'code',
    cellIndex: typeof cell.cellIndex === 'number' ? cell.cellIndex : index,
    source: typeof cell.source === 'string' ? cell.source : '',
    executionCount: typeof cell.executionCount === 'number' ? cell.executionCount : undefined,
    outputs: Array.isArray(cell.outputs) ? cell.outputs : [],
    status: cell.status || 'idle',
    errorMessage: cell.errorMessage || undefined,
    executionTimeMs: typeof cell.executionTimeMs === 'number' ? cell.executionTimeMs : undefined,
  }));

  return normalized
    .sort((left, right) => left.cellIndex - right.cellIndex)
    .map((cell, index) => ({
      ...cell,
      cellIndex: index,
    }));
}

export function buildNotebookTitle(sessionTitle?: string | null, fallbackPrompt?: string): string {
  if (sessionTitle && sessionTitle.trim() && sessionTitle.trim().toLowerCase() !== 'new chat') {
    return clampTitle(`${sessionTitle.trim()} Notebook`);
  }

  if (fallbackPrompt?.trim()) {
    return clampTitle(fallbackPrompt.trim());
  }

  return DEFAULT_NOTEBOOK_TITLE;
}

export function createStarterNotebook(sessionId?: string | null): NotebookDraft {
  return {
    title: DEFAULT_NOTEBOOK_TITLE,
    description: 'Reusable analysis workspace tied to a Mastiff session.',
    sessionId,
    cells: normalizeNotebookCells([
      {
        cellType: 'markdown',
        source: [
          '# Analysis Notebook',
          '',
          'Describe the question you are answering, the data in scope, and the decisions this notebook should support.',
        ].join('\n'),
      },
      {
        cellType: 'code',
        source: [
          '# Session datasets are automatically mounted into the notebook runtime.',
          '# `df` points to the primary dataset and `dfs` exposes all session files by filename.',
          '',
          'result = df.head() if "df" in globals() and getattr(df, "empty", True) is False else "No active dataset is attached to this notebook yet."',
        ].join('\n'),
      },
    ]),
  };
}

export function buildNotebookFromAnalysis({
  sessionId,
  sessionTitle,
  message,
  datasetNames = [],
  userPrompt,
}: BuildNotebookFromAnalysisOptions): NotebookDraft {
  const title = buildNotebookTitle(sessionTitle, userPrompt || message.content);
  const cleanedSummary = message.content.trim() || 'Analysis summary unavailable.';
  const datasetLine = datasetNames.length > 0
    ? `Datasets in scope: ${datasetNames.join(', ')}.`
    : 'Datasets in scope: Uses the session datasets available at execution time.';

  const summaryCell = [
    `# ${title}`,
    '',
    sessionTitle ? `Session: **${sessionTitle}**` : 'Session: **Untitled Session**',
    datasetLine,
    message.persona ? `Persona: **${message.persona}**` : '',
    '',
    userPrompt ? '## Original Prompt' : '',
    userPrompt || '',
    userPrompt ? '' : '',
    '## Analyst Summary',
    cleanedSummary,
    '',
    '## Reproduction Notes',
    '- Re-run the code cell to regenerate this analysis against the linked session datasets.',
    '- Edit the code cell to extend or adapt the workflow before sharing it.',
  ].filter(Boolean).join('\n');

  const codeCellSource = message.code?.trim()
    ? message.code
    : [
      '# Add reproducible analysis code here.',
      '# Session datasets will be available as `df` and `dfs`.',
      '',
      'result = "Add analysis code to turn this notebook into a reusable workflow."',
    ].join('\n');

  return {
    title,
    description: 'Notebook created from a Mastiff analysis response for reproducible follow-up work.',
    sessionId,
    cells: normalizeNotebookCells([
      {
        cellType: 'markdown',
        source: summaryCell,
      },
      {
        cellType: 'code',
        source: codeCellSource,
      },
    ]),
  };
}
