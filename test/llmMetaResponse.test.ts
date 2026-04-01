import { describe, expect, it } from 'vitest';
import { buildChatSystemPrompt, getGroundedMetaResponse } from '../src/services/llm';

describe('grounded meta responses', () => {
  it('grounds self-awareness questions in configured behavior', () => {
    const response = getGroundedMetaResponse('Does the model understand its own existence?');

    expect(response).toContain('does **not** have self-awareness');
    expect(response).toContain('programmed behavior');
    expect(response).toContain('configured to do');
  });

  it('frames capability questions as product-defined behavior', () => {
    const response = getGroundedMetaResponse('What can you do?');

    expect(response).toContain('product-defined capabilities');
    expect(response).toContain('enterprise-grade data and analytics support');
    expect(response).toContain('not evidence that the model understands its own existence');
  });

  it('returns null for ordinary analysis questions', () => {
    expect(getGroundedMetaResponse('Show me revenue by region')).toBeNull();
  });
});

describe('chat system prompt', () => {
  it('includes core behavior guidelines and persona', () => {
    const prompt = buildChatSystemPrompt('chat', 'Focus on business impact.');

    expect(prompt).toContain('BE CONCISE');
    expect(prompt).toContain('LEAD WITH ACTIONS');
    expect(prompt).toContain('ANALYST PERSONA: Focus on business impact.');
  });
});
