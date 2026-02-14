import ScheduledReportService from '../src/services/scheduledReportService';
import TemplateService from '../src/services/templateService';

describe('ScheduledReportService basics', () => {
  it('can calculate next execution time from cron', () => {
    const next = (ScheduledReportService as any).calculateNextExecutionTime('0 0 * * *');
    expect(next).toBeInstanceOf(Date);
  });

  it('seeds templates without throwing', async () => {
    const systemUserId = process.env.SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000';
    await expect(TemplateService.seedSystemTemplates(systemUserId)).resolves.not.toThrow();
  });
});
