import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { files } from '@/db/schema';
import { authenticateRequest } from '@/lib/auth';
import { validateCSRFRequest } from '@/lib/csrf';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfValidation = await validateCSRFRequest(request);
  if (!csrfValidation.valid) {
    return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
  }

  const user = await authenticateRequest(request);
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const payload = await request.json().catch(() => ({}));
  const selectedColumns = Array.isArray(payload?.selectedColumns)
    ? payload.selectedColumns.filter((value: unknown) => typeof value === 'string' && value.trim().length > 0)
    : [];

  const existing = await db.query.files.findFirst({
    where: and(eq(files.id, id), eq(files.userId, user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const metadata = ((existing.metadata || {}) as Record<string, any>);
  const nextMetadata = {
    ...metadata,
    validationStatus: 'active',
    ...(selectedColumns.length > 0 ? { selectedColumns } : {}),
  };

  const [updated] = await db.update(files)
    .set({ metadata: nextMetadata })
    .where(and(eq(files.id, id), eq(files.userId, user.id)))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfValidation = await validateCSRFRequest(request);
  if (!csrfValidation.valid) {
    return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
  }

  const { id } = await params;

  const user = await authenticateRequest(request);
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await db.query.files.findFirst({
    where: and(eq(files.id, id), eq(files.userId, user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    await fs.rm(existing.filePath, { force: true });
  } catch {
    // Ignore missing temp files and continue DB cleanup.
  }

  await db.delete(files).where(and(eq(files.id, id), eq(files.userId, user.id)));
  return NextResponse.json({ success: true });
}
