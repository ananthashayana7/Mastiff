import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the service under test
import ScheduledReportService from '../src/services/scheduledReportService';

// Mock nodemailer to simulate transient failures then success
let sendAttempts = 0;
const mockSendMail = vi.fn(async () => {
  sendAttempts += 1;
  // fail first two attempts, succeed on third
  if (sendAttempts < 3) {
    const err: any = new Error('Transient SMTP error');
    err.code = 'ECONNRESET';
    throw err;
  }
  return { messageId: 'ok' };
});

vi.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: mockSendMail }),
}));

// Mock the DB module used by the service to capture distribution logs/updates
const insertMock = vi.fn(() => ({ values: async () => Promise.resolve() }));
const updateMock = vi.fn(() => ({ set: () => ({ where: async () => Promise.resolve() }) }));

vi.mock('@/src/db', () => ({
  insert: insertMock,
  update: updateMock,
}));

describe('deliverReport retry/backoff', () => {
  beforeEach(() => {
    sendAttempts = 0;
    mockSendMail.mockClear();
    insertMock.mockClear();
    updateMock.mockClear();
    // Use small backoff to keep tests fast
    process.env.REPORT_SEND_RETRIES = '4';
    process.env.REPORT_SEND_BASE_DELAY_MS = '10';
    process.env.SMTP_HOST = 'smtp.example';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.FROM_EMAIL = 'no-reply@example.com';
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('retries transient failures and eventually logs sent distribution', async () => {
    const executionId = 'exec-1';
    const report: any = {
      id: 'r1',
      title: 'Test Report',
      recipients: JSON.stringify([{ email: 'u@example.com' }]),
    };

    const output = { hello: 'world' };

    await expect((ScheduledReportService as any).deliverReport(executionId, report, output)).resolves.not.toThrow();

    // Expect sendMail called multiple times (at least 3 attempts)
    expect(mockSendMail.mock.calls.length).toBeGreaterThanOrEqual(3);

    // Expect DB insert was called to log distribution
    expect(insertMock).toHaveBeenCalled();

    // Expect reportExecutions update was called to set successfulRecipients
    expect(updateMock).toHaveBeenCalled();
  });
});
