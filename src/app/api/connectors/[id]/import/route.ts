/**
 * SharePoint Connector Import Route
 *
 * POST /api/connectors/[id]/import
 * Imports selected SharePoint file sources into the active session as Mastiff files.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

import { db } from '@/db';
import { connectors } from '@/db/connectorSchema';
import { files as dbFiles, sessions } from '@/db/schema';
import { encryptionService } from '@/services/encryptionService';
import { authenticateRequest } from '@/lib/auth';
import { rateLimiter } from '@/lib/rateLimiting';
import { buildTabularMetadataFallback } from '@/app/api/files/upload/route';

export const dynamic = 'force-dynamic';

const SOURCE_SCHEMA = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  metadata: z
    .object({
      driveId: z.string().optional(),
      itemId: z.string().optional(),
      mimeType: z.string().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

const IMPORT_SCHEMA = z.object({
  sessionId: z.string().uuid(),
  sources: z.array(SOURCE_SCHEMA).min(1),
});

const SUPPORTED_TABULAR_EXT = new Set(['.csv', '.xlsx', '.xls', '.json', '.tsv']);
const SUPPORTED_DOC_EXT = new Set(['.txt']);

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function inferFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext.replace('.', '') || 'bin';
}

function buildTextMetadata(text: string, filename: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sample = lines.slice(0, 10).map((value, idx) => ({
    line_number: idx + 1,
    text: value,
  }));

  return {
    row_count: lines.length,
    column_count: 2,
    original_filename: filename,
    columns: {
      line_number: {
        dtype: 'int64',
        null_count: 0,
        null_percentage: 0,
        unique_count: lines.length,
        sample_values: sample.slice(0, 5).map((row) => row.line_number),
      },
      text: {
        dtype: 'object',
        null_count: 0,
        null_percentage: 0,
        unique_count: new Set(lines).size,
        sample_values: sample.slice(0, 5).map((row) => row.text),
      },
    },
    sample,
  };
}

async function getSharePointAccessToken(creds: Record<string, any>): Promise<string> {
  const tenantId = String(creds.tenantId || '').trim();
  const clientId = String(creds.clientId || '').trim();
  const clientSecret = String(creds.clientSecret || '').trim();
  const refreshToken = String(creds.refreshToken || '').trim();

  if (!tenantId || !clientId || !clientSecret || !refreshToken) {
    throw new Error('SharePoint credentials must include tenantId, clientId, clientSecret, and refreshToken');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'https://graph.microsoft.com/.default offline_access',
  });

  const response = await axios.post(tokenUrl, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  });

  const accessToken = response.data?.access_token;
  if (!accessToken) {
    throw new Error('Failed to obtain SharePoint access token');
  }

  return accessToken;
}

function resolveDriveAndItem(source: z.infer<typeof SOURCE_SCHEMA>): { driveId: string | null; itemId: string | null } {
  const directDrive = source.metadata?.driveId || null;
  const directItem = source.metadata?.itemId || null;

  if (directDrive && directItem) {
    return { driveId: directDrive, itemId: directItem };
  }

  const idParts = String(source.id || '').split(':');
  if (idParts.length >= 2) {
    return {
      driveId: directDrive || idParts[0] || null,
      itemId: directItem || idParts[1] || null,
    };
  }

  return { driveId: directDrive, itemId: directItem };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientIdForLimit = request.headers.get('x-forwarded-for') || 'unknown';
    await rateLimiter.checkLimit('connector:import', clientIdForLimit, 100, 3600);

    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    const payload = IMPORT_SCHEMA.parse(await request.json());

    const ownedSession = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, payload.sessionId), eq(sessions.userId, userId)))
      .limit(1);

    if (!ownedSession[0]) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const connectorRows = await db
      .select()
      .from(connectors)
      .where(and(eq(connectors.id, params.id), eq(connectors.userId, userId)))
      .limit(1);

    const connector = connectorRows[0];
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    if (connector.type !== 'sharepoint') {
      return NextResponse.json({ error: 'Import is currently supported for SharePoint connectors only' }, { status: 400 });
    }

    let creds: Record<string, unknown>;
    try {
      const decrypted = encryptionService.decryptFromString(String(connector.encryptedCredentials || ''));
      creds = JSON.parse(decrypted || '{}');
    } catch (credentialError: any) {
      return NextResponse.json(
        { error: 'Credential decryption failed for this connector' },
        { status: 400 }
      );
    }

    const accessToken = await getSharePointAccessToken(creds);

    const graphClient = axios.create({
      baseURL: 'https://graph.microsoft.com/v1.0',
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 60000,
    });

    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    const imported: any[] = [];
    const skipped: Array<{ sourceId: string; reason: string }> = [];

    for (const source of payload.sources) {
      const sourceName = source.name || source.id;
      const { driveId, itemId } = resolveDriveAndItem(source);

      if (!driveId || !itemId) {
        skipped.push({ sourceId: source.id, reason: 'Missing driveId/itemId for source' });
        continue;
      }

      const ext = path.extname(sourceName).toLowerCase();
      const isTabular = SUPPORTED_TABULAR_EXT.has(ext);
      const isDoc = SUPPORTED_DOC_EXT.has(ext);

      if (!isTabular && !isDoc) {
        skipped.push({ sourceId: source.id, reason: `Unsupported extension: ${ext || 'unknown'}` });
        continue;
      }

      try {
        const contentResponse = await graphClient.get(`/drives/${driveId}/items/${itemId}/content`, {
          responseType: 'arraybuffer',
        });

        const buffer = Buffer.from(contentResponse.data as ArrayBuffer);
        const safeName = sanitizeFileName(sourceName || `${driveId}-${itemId}.bin`);
        const storedPath = path.join(uploadDir, `${Date.now()}-${safeName}`);
        await fs.writeFile(storedPath, buffer);

        let metadata: Record<string, any> = {};
        if (isTabular) {
          metadata = await buildTabularMetadataFallback(storedPath, sourceName, ext);
        } else {
          const text = buffer.toString('utf-8');
          metadata = buildTextMetadata(text, sourceName);
        }

        const [dbFile] = await db.insert(dbFiles).values({
          userId,
          sessionId: payload.sessionId,
          filename: sourceName,
          fileType: inferFileType(sourceName),
          filePath: storedPath,
          fileSize: buffer.byteLength,
          metadata: metadata as any,
        }).returning();

        imported.push(dbFile);
      } catch (sourceError: any) {
        skipped.push({
          sourceId: source.id,
          reason: sourceError?.message || 'Failed to import source',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${imported.length} source(s) into this session${skipped.length ? `, skipped ${skipped.length}` : ''}.`,
      files: imported,
      skipped,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to import SharePoint sources' },
      { status: 500 }
    );
  }
}
