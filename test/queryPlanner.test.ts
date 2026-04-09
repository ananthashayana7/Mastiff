import { describe, expect, it } from 'vitest';
import { buildQueryPlanPromptBlock, deriveQueryPlan } from '../src/lib/queryPlanner';

describe('query planner delivery contract', () => {
  it('requires written summary alongside charts when data context exists', () => {
    const plan = deriveQueryPlan('analyze this dataset and forecast the trend', {
      hasDataContext: true,
      fileCount: 1,
    });

    const promptBlock = buildQueryPlanPromptBlock(plan);

    expect(promptBlock).toContain('written insights');
    expect(promptBlock).toContain('Charts never replace the written summary');
  });
});