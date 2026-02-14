import { describe, it, expect, afterAll } from 'vitest';
import ScheduledReportService from '../src/services/scheduledReportService';

describe('ScheduledReportService scheduling', () => {
  it('calculateNextExecutionTime returns a Date for daily cron', () => {
    const next = (ScheduledReportService as any).calculateNextExecutionTime('0 0 * * *');
    expect(next).toBeInstanceOf(Date);
  });

  it('schedules and unschedules a cron job', () => {
    const id = 'test-report-job';
    (ScheduledReportService as any).scheduleReport(id, '* * * * *');
    const cronJobs = (ScheduledReportService as any).cronJobs as Map<string, any>;
    expect(cronJobs.has(id)).toBe(true);
    const job = cronJobs.get(id);
    expect(job).toBeTruthy();

    // unschedule
    (ScheduledReportService as any).unscheduleReport(id);
    expect(cronJobs.has(id)).toBe(false);
  });

  afterAll(() => {
    // Ensure we shutdown any remaining jobs
    try { (ScheduledReportService as any).shutdown(); } catch (e) { /* ignore */ }
  });
});
