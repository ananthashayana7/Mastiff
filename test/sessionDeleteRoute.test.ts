import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const findSessionMock = vi.fn();
const findFilesMock = vi.fn();
const deleteWhereMock = vi.fn();
const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));
const transactionMock = vi.fn(async (callback: (tx: { delete: typeof deleteMock }) => Promise<void>) => {
  await callback({ delete: deleteMock });
});
const authenticateRequestMock = vi.fn();
const validateCSRFRequestMock = vi.fn();
const terminateMock = vi.fn();
const rmMock = vi.fn();

vi.mock('@/db', () => ({
  db: {
    query: {
      sessions: {
        findFirst: findSessionMock,
      },
      files: {
        findMany: findFilesMock,
      },
    },
    transaction: transactionMock,
  },
}));

vi.mock('@/db/schema', () => ({
  sessions: { id: 'id', userId: 'userId' },
  messages: { sessionId: 'sessionId' },
  files: { sessionId: 'sessionId', userId: 'userId' },
}));

vi.mock('@/lib/auth', () => ({
  authenticateRequest: authenticateRequestMock,
}));

vi.mock('@/lib/csrf', () => ({
  validateCSRFRequest: validateCSRFRequestMock,
}));

vi.mock('@/services/kernel', () => ({
  kernelService: {
    terminate: terminateMock,
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    rm: rmMock,
  },
}));

describe('session delete route', () => {
  beforeEach(() => {
    findSessionMock.mockReset();
    findFilesMock.mockReset();
    deleteWhereMock.mockReset();
    deleteMock.mockClear();
    transactionMock.mockClear();
    authenticateRequestMock.mockReset();
    validateCSRFRequestMock.mockReset();
    terminateMock.mockReset();
    rmMock.mockReset();

    validateCSRFRequestMock.mockResolvedValue({ valid: true });
    authenticateRequestMock.mockResolvedValue({ id: 'user-1' });
    findSessionMock.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
    findFilesMock.mockResolvedValue([
      { id: 'file-1', userId: 'user-1', filePath: 'uploads/a.csv' },
      { id: 'file-2', userId: 'user-1', filePath: 'uploads/b.csv' },
    ]);
    rmMock.mockResolvedValue(undefined);
  });

  it('deletes uploaded files from disk before removing session records', async () => {
    const { DELETE } = await import('../src/app/api/sessions/[id]/route');

    const request = new NextRequest('http://localhost/api/sessions/session-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: { id: 'session-1' } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true });
    expect(rmMock).toHaveBeenCalledTimes(2);
    expect(rmMock).toHaveBeenCalledWith('uploads/a.csv', { force: true });
    expect(rmMock).toHaveBeenCalledWith('uploads/b.csv', { force: true });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(deleteWhereMock).toHaveBeenCalledTimes(3);
    expect(terminateMock).toHaveBeenCalledWith('session-1');
  });

  it('fails without deleting database records when file cleanup fails', async () => {
    const { DELETE } = await import('../src/app/api/sessions/[id]/route');
    rmMock.mockRejectedValueOnce(new Error('permission denied'));

    const request = new NextRequest('http://localhost/api/sessions/session-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: { id: 'session-1' } });
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: 'Failed to delete session' });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(terminateMock).not.toHaveBeenCalled();
  });
});