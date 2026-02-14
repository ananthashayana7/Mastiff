import { NextRequest, NextResponse } from 'next/server';
import { ExportService, TableData } from '@/services/exportService';
import { authenticateRequest } from '@/lib/auth';
import { AuditService } from '@/services/auditService';

export const dynamic = 'force-dynamic';

/**
 * Export data in requested format
 * POST /api/exports
 * 
 * Body: {
 *   format: 'csv' | 'excel' | 'pdf' | 'json',
 *   data: { headers: string[], rows: any[][] },
 *   title?: string,
 *   filename?: string
 * }
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { format, data, title, filename } = await req.json();

    // Validate input
    if (!format || !data || !data.headers || !data.rows) {
      return NextResponse.json(
        { error: 'Missing required fields: format, data (with headers and rows)' },
        { status: 400 }
      );
    }

    if (!['csv', 'excel', 'pdf', 'json'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Allowed: csv, excel, pdf, json' },
        { status: 400 }
      );
    }

    // Audit
    await AuditService.logAuditAction({
      userId: user.id,
      action: 'export_data',
      resourceType: 'export',
      resourceId: format,
      status: 'success',
      details: { format, rowCount: data.rows.length },
      ipAddress: AuditService.getClientIp(req.headers),
      userAgent: req.headers.get('user-agent') || '',
    });

    // Export data
    let exportBuffer: Buffer;
    const tableData: TableData = {
      headers: data.headers,
      rows: data.rows,
      metadata: data.metadata,
    };

    switch (format) {
      case 'csv':
        exportBuffer = await ExportService.toCSV(tableData, { title, filename });
        break;
      case 'excel':
        exportBuffer = await ExportService.toExcel(tableData, { title, filename });
        break;
      case 'pdf':
        exportBuffer = await ExportService.toPDF(tableData, { title, filename, timestamp: true });
        break;
      case 'json':
        exportBuffer = await ExportService.toJSON(tableData, { title, filename });
        break;
      default:
        return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    // Create response
    const response = new NextResponse(exportBuffer);

    // Set headers
    const mimeType = ExportService.getMimeType(format as any);
    const extension = ExportService.getFileExtension(format as any);
    const downloadFilename = filename || `export_${Date.now()}${extension}`;

    response.headers.set('Content-Type', mimeType);
    response.headers.set('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    response.headers.set('Content-Length', exportBuffer.length.toString());

    return response;
  } catch (error: any) {
    console.error('Export error:', error);

    await AuditService.logAuditAction({
      userId: (await authenticateRequest(req))?.id,
      action: 'export_error',
      resourceType: 'export',
      resourceId: 'error',
      status: 'error',
      error: error?.message,
      ipAddress: AuditService.getClientIp(req.headers),
      userAgent: req.headers.get('user-agent') || '',
    });

    return NextResponse.json(
      { error: error?.message || 'Export failed' },
      { status: 500 }
    );
  }
}
