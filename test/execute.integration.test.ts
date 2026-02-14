import { describe, it, expect, vi, beforeEach } from 'vitest';

import ScheduledReportService from '../src/services/scheduledReportService';

// Mock DB to return a scheduled report when queried
const mockFindFirst = vi.fn(async (opts?: any) => {
  return {
    id: 'r-integ-1',
    userId: 'user-1',
    title: 'Integration Test Report',
    schedule: '0 0 * * *',
    type: 'template',
    templateId: 't1',
    recipients: JSON.stringify([{ email: 'x@example.com' }]),
    failureCount: 0,
    executionCount: 0,
  };
});

const insertMock = vi.fn(() => ({ values: async () => Promise.resolve() }));
const updateMock = vi.fn(() => ({ set: () => ({ where: async () => Promise.resolve() }) }));

vi.mock('@/src/db', () => ({
  query: { scheduledReports: { findFirst: mockFindFirst } },
  insert: insertMock,
  update: updateMock,
}));

// Spy on deliverReport to ensure it's called
const deliverSpy = vi.spyOn(ScheduledReportService as any, 'deliverReport');

describe('executeReport integration-style', () => {
  beforeEach(() => {
    mockFindFirst.mockClear();
    insertMock.mockClear();
    updateMock.mockClear();
    deliverSpy.mockClear();
  });

  it('executes report and records execution', async () => {
    // Replace deliverReport with a noop to avoid SMTP
    deliverSpy.mockImplementation(async () => Promise.resolve());

    const execId = await ScheduledReportService.executeReport('r-integ-1', 'manual', 'user-1');

    expect(execId).toBeTruthy();

    // verify we read scheduled report
    expect(mockFindFirst).toHaveBeenCalled();

    // verify we inserted a reportExecutions row at start
    expect(insertMock).toHaveBeenCalled();

    // verify deliverReport was invoked
    expect(deliverSpy).toHaveBeenCalled();
  });
});
