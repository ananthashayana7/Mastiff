import { describe, it, expect } from 'vitest';

/**
 * Tests the response content fallback logic used in the frontend
 * to prevent "undefined" from being displayed as a chat response.
 *
 * This mirrors the logic in src/app/page.tsx handleSend and handleAutoAnalysis.
 */
describe('Response content fallback logic', () => {
  // This mirrors the logic: assistantMsg.content || assistantMsg.error || 'No response received. Please try again.'
  function getResponseContent(assistantMsg: { content?: string; error?: string }) {
    return assistantMsg.content || assistantMsg.error || 'No response received. Please try again.';
  }

  it('returns content when content is present', () => {
    const msg = { content: 'Hello! How can I help?' };
    expect(getResponseContent(msg)).toBe('Hello! How can I help?');
  });

  it('returns error message when content is missing but error is present', () => {
    const msg = { error: 'Session not found' };
    expect(getResponseContent(msg)).toBe('Session not found');
  });

  it('returns fallback when both content and error are missing', () => {
    const msg = {};
    expect(getResponseContent(msg)).toBe('No response received. Please try again.');
  });

  it('returns fallback when content is undefined', () => {
    const msg = { content: undefined, error: undefined };
    expect(getResponseContent(msg)).toBe('No response received. Please try again.');
  });

  it('returns fallback when content is empty string', () => {
    const msg = { content: '', error: '' };
    expect(getResponseContent(msg)).toBe('No response received. Please try again.');
  });

  it('prefers content over error when both are present', () => {
    const msg = { content: 'Valid response', error: 'Some error' };
    expect(getResponseContent(msg)).toBe('Valid response');
  });

  it('returns content for successful API response (DB row)', () => {
    // Simulates a successful chat response from the database
    const msg = {
      id: '123',
      sessionId: '456',
      role: 'assistant',
      content: 'I am Mastiff, an AI data analyst.',
      code: null,
      result: null,
      visualizationUrl: null,
      createdAt: '2025-01-01T00:00:00Z',
    };
    expect(getResponseContent(msg)).toBe('I am Mastiff, an AI data analyst.');
  });

  it('returns error content for 400 error response', () => {
    // Simulates the fixed 400 error response
    const msg = {
      error: 'Missing sessionId or content',
      content: 'Missing session or message content. Please try again.',
      role: 'assistant',
      id: 'error-123',
    };
    expect(getResponseContent(msg)).toBe('Missing session or message content. Please try again.');
  });

  it('returns error content for 404 error response', () => {
    // Simulates the fixed 404 error response
    const msg = {
      error: 'Session not found',
      content: 'Session not found. Please start a new chat session.',
      role: 'assistant',
      id: 'error-456',
    };
    expect(getResponseContent(msg)).toBe('Session not found. Please start a new chat session.');
  });

  it('returns error content for 500 error response', () => {
    // Simulates the 500 error response
    const msg = {
      error: 'Database connection refused',
      content: 'I encountered an error while processing your request: Database connection refused. Please try again.',
      role: 'assistant',
      id: 'error-789',
    };
    expect(getResponseContent(msg)).toBe(
      'I encountered an error while processing your request: Database connection refused. Please try again.'
    );
  });
});

describe('Session message content fallback', () => {
  it('returns content when present', () => {
    const m = { content: 'Hello' };
    expect(m.content || '').toBe('Hello');
  });

  it('returns empty string when content is null', () => {
    const m = { content: null };
    expect(m.content || '').toBe('');
  });

  it('returns empty string when content is undefined', () => {
    const m = { content: undefined };
    expect(m.content || '').toBe('');
  });
});

describe('Error message formatting', () => {
  it('handles undefined err.message gracefully', () => {
    const err: any = {};
    const content = `An error occurred: ${err?.message || 'Unknown error'}. Please try again.`;
    expect(content).toBe('An error occurred: Unknown error. Please try again.');
  });

  it('handles null err gracefully', () => {
    const err: any = null;
    const content = `An error occurred: ${err?.message || 'Unknown error'}. Please try again.`;
    expect(content).toBe('An error occurred: Unknown error. Please try again.');
  });

  it('uses err.message when available', () => {
    const err = { message: 'Network timeout' };
    const content = `An error occurred: ${err?.message || 'Unknown error'}. Please try again.`;
    expect(content).toBe('An error occurred: Network timeout. Please try again.');
  });
});
