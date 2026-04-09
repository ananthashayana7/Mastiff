import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const insertValuesMock = vi.fn();
const insertMock = vi.fn(() => ({ values: insertValuesMock }));

const llmGetAnalysisCodeMock = vi.fn();
const llmSummarizeExecutionMock = vi.fn();
const llmRepairAnalysisCodeMock = vi.fn();
const llmChatMock = vi.fn();
const kernelExecuteMock = vi.fn();
const authenticateRequestMock = vi.fn();

vi.mock('@/db', () => ({
  db: {
    query: {
      sessions: {
        findFirst: mockFindFirst,
      },
    },
    insert: insertMock,
  },
}));

vi.mock('@/db/schema', () => ({
  messages: {
    createdAt: 'createdAt',
    id: 'id',
  },
  sessions: {
    id: 'id',
  },
}));

vi.mock('@/db/connectorSchema', () => ({
  connectors: {
    id: 'id',
    name: 'name',
    type: 'type',
    description: 'description',
    userId: 'userId',
  },
}));

vi.mock('@/services/llm', () => ({
  buildDeterministicAnalysisFallbackCode: vi.fn(() => 'result = "fallback"'),
  classifyLlmError: (error: any) => {
    if (error?.status === 429) {
      return {
        code: 'rate_limit',
        status: 429,
        error: 'AI rate limit or quota exceeded',
        content: 'The AI service is temporarily rate-limited or out of quota. Please try again in a few minutes.',
      };
    }

    return {
      code: 'unknown',
      status: 500,
      error: 'An unexpected error occurred during analysis',
      content: 'I encountered an error while processing your request. Please try again.',
    };
  },
  llm: {
    getAnalysisCode: llmGetAnalysisCodeMock,
    summarizeExecution: llmSummarizeExecutionMock,
    repairAnalysisCode: llmRepairAnalysisCodeMock,
    chat: llmChatMock,
  },
}));

vi.mock('@/services/kernel', () => ({
  kernelService: {
    execute: kernelExecuteMock,
  },
}));

vi.mock('@/lib/auth', () => ({
  authenticateRequest: authenticateRequestMock,
}));

vi.mock(
  '@/services/dataIntelligenceService',
  () => ({
    generateDataIntelligenceReport: () => [],
    formatWarningsForPrompt: () => '',
    analyseFile: () => ({ fileName: 'mock', qualityScore: 100, warnings: [] }),
    formatForPrompt: () => '',
  })
);

describe('chat route activeFileIds filtering', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    insertMock.mockClear();
    insertValuesMock.mockReset();
    llmGetAnalysisCodeMock.mockReset();
    llmSummarizeExecutionMock.mockReset();
    llmRepairAnalysisCodeMock.mockReset();
    llmChatMock.mockReset();
    kernelExecuteMock.mockReset();

    const metadata = {
      row_count: 3,
      column_count: 2,
      columns: {
        date: { dtype: 'object', null_count: 0, null_percentage: 0, unique_count: 3, sample_values: ['2025-01-01'] },
        value: { dtype: 'float64', null_count: 0, null_percentage: 0, unique_count: 3, sample_values: [1, 2, 3] },
      },
      sample: [{ date: '2025-01-01', value: 10 }],
    };

    mockFindFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      files: [
        { id: 'file-a', filename: 'a.csv', filePath: '/tmp/a.csv', metadata },
        { id: 'file-b', filename: 'b.csv', filePath: '/tmp/b.csv', metadata },
      ],
      messages: [
        { id: 'm0', role: 'user', content: 'prev', createdAt: new Date().toISOString() },
      ],
    });

    llmGetAnalysisCodeMock.mockResolvedValue({
      explanation: 'ok',
      code: 'result = 42',
    });

    authenticateRequestMock.mockResolvedValue({ id: 'user-1' });

    kernelExecuteMock.mockResolvedValue({
      result: '42',
      charts: [],
      plotly_charts: [],
      updated_df_sample: [],
    });

    llmSummarizeExecutionMock.mockResolvedValue('summary');
    llmRepairAnalysisCodeMock.mockResolvedValue(null);

    insertValuesMock.mockImplementation((payload: any) => ({
      returning: async () => [{
        id: 'assistant-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: payload.content || 'summary',
      }],
    }));

    llmChatMock.mockResolvedValue('chat summary');
  });

  it('passes only selected files when activeFileIds is provided', async () => {
    const { POST } = await import('../src/app/api/chat/route');

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        content: 'analyze trends',
        mode: 'analysis',
        activeFileIds: ['file-b'],
      }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(200);

    expect(llmGetAnalysisCodeMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const call of llmGetAnalysisCodeMock.mock.calls) {
      const fileContexts = call[1] as Array<{ name: string }>;
      expect(fileContexts).toHaveLength(1);
      expect(fileContexts[0].name).toBe('b.csv');
    }

    expect(kernelExecuteMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const call of kernelExecuteMock.mock.calls) {
      const executorFiles = call[2] as Array<{ id?: string; name: string }>;
      expect(executorFiles).toHaveLength(1);
      expect(executorFiles[0].name).toBe('b.csv');
      expect(executorFiles[0].id).toBe('file-b');
    }
  });

  it('falls back to all session files when activeFileIds is an empty array', async () => {
    const { POST } = await import('../src/app/api/chat/route');

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        content: 'analyze trends',
        mode: 'analysis',
        activeFileIds: [],
      }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(200);

    expect(llmGetAnalysisCodeMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const call of llmGetAnalysisCodeMock.mock.calls) {
      const fileContexts = call[1] as Array<{ name: string }>;
      expect(fileContexts).toHaveLength(2);
      expect(fileContexts.map((f) => f.name).sort()).toEqual(['a.csv', 'b.csv']);
    }
  });

  it('falls back to all session files when activeFileIds has only invalid ids', async () => {
    const { POST } = await import('../src/app/api/chat/route');

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        content: 'analyze trends',
        mode: 'analysis',
        activeFileIds: ['missing-id'],
      }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(200);

    expect(kernelExecuteMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const call of kernelExecuteMock.mock.calls) {
      const executorFiles = call[2] as Array<{ id?: string; name: string }>;
      expect(executorFiles).toHaveLength(2);
      expect(executorFiles.map((f) => f.name).sort()).toEqual(['a.csv', 'b.csv']);
      expect(executorFiles.map((f) => f.id).sort()).toEqual(['file-a', 'file-b']);
    }
  });

  it('returns a plain classified error response for chat-mode rate limits', async () => {
    llmChatMock.mockRejectedValueOnce({ status: 429, message: 'RESOURCE_EXHAUSTED: quota exceeded' });

    const { POST } = await import('../src/app/api/chat/route');

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        content: 'hello',
        mode: 'chat',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.content).toBe('The AI service is temporarily rate-limited or out of quota. Please try again in a few minutes.');
    expect(body.error).toBe('AI rate limit or quota exceeded');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('treats pasted CSV data as analysis context and runs chart-capable analysis automatically', async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: 'session-inline',
      userId: 'user-1',
      files: [],
      messages: [],
    });

    llmGetAnalysisCodeMock.mockResolvedValueOnce({
      explanation: 'Analyze pasted data',
      code: 'result = 42',
    });

    const { POST } = await import('../src/app/api/chat/route');

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-inline',
        content: ['month,revenue,cost', 'Jan,100,60', 'Feb,120,70', 'Mar,130,72'].join('\n'),
        mode: 'chat',
      }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(200);
    expect(llmGetAnalysisCodeMock).toHaveBeenCalled();
    expect(llmChatMock).not.toHaveBeenCalled();
  });

  it('falls back to file preview rows when chart recovery produces no visual payload', async () => {
    const insertedPayloads: any[] = [];
    insertValuesMock.mockImplementation((payload: any) => {
      insertedPayloads.push(payload);
      return {
        returning: async () => [{
          id: 'assistant-preview',
          sessionId: 'session-1',
          role: 'assistant',
          content: payload.content || 'summary',
          result: payload.result,
        }],
      };
    });

    llmGetAnalysisCodeMock.mockResolvedValueOnce({
      explanation: 'ok',
      code: 'result = 42',
    });

    kernelExecuteMock.mockResolvedValueOnce({
      result: 'Data is empty after loading. Please upload a file with at least one data row.',
      charts: [],
      plotly_charts: [],
      updated_df_sample: [],
    });

    const { POST } = await import('../src/app/api/chat/route');

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        content: 'analyze this file',
        mode: 'analysis',
      }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(200);

    const assistantInsert = insertedPayloads.find((payload) => payload.role === 'assistant');
    expect(assistantInsert?.result?.updated_df_sample).toEqual([
      { source_file: 'a.csv', date: '2025-01-01', value: 10 },
      { source_file: 'b.csv', date: '2025-01-01', value: 10 },
    ]);
  });
});
