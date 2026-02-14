import { describe, it, expect } from 'vitest';
import ScheduledReportService from '../src/services/scheduledReportService';

describe('cron parser next run', () => {
  it('parses common cron expressions', () => {
    const expressions = [
      '0 0 * * *',
      '*/15 * * * *',
      '0 8 * * 1-5',
    ];

    for (const expr of expressions) {
      const next = (ScheduledReportService as any).calculateNextExecutionTime(expr);
      expect(next).toBeInstanceOf(Date);
    }
  });
});
