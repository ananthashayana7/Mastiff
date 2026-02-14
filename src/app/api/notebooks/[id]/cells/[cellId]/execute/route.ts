import { NextRequest, NextResponse } from 'next/server';
import { DockerSandboxExecutor } from '@/services/dockerSandboxExecutor';
import { WebSocketService } from '@/services/websocketService';
import { AuditService } from '@/services/auditService';
import { authenticateRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Execute notebook cell
 * POST /api/notebooks/:id/cells/:cellId/execute
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; cellId: string } }
) {
  const startTime = Date.now();

  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code, language = 'python', variables = {} } = await req.json();

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    // Validate language support
    const supportedLanguages = ['python', 'javascript', 'r'];
    if (!supportedLanguages.includes(language)) {
      return NextResponse.json(
        { error: `Unsupported language. Supported: ${supportedLanguages.join(', ')}` },
        { status: 400 }
      );
    }

    // Initialize sandbox executor
    const sandbox = new DockerSandboxExecutor({
      maxMemoryMb: 512,
      maxCpuTimeMs: 30000,
      maxTimeoutMs: 60000,
      allowNetworkAccess: false,
    });

    // Check Docker availability
    const dockerHealthy = await sandbox.healthCheck();
    if (!dockerHealthy) {
      return NextResponse.json(
        { error: 'Sandbox executor unavailable' },
        { status: 503 }
      );
    }

    // Execute code
    let result;
    switch (language) {
      case 'python':
        result = await sandbox.executePython(code, variables);
        break;
      case 'javascript':
        result = await sandbox.executeNodeJS(code, variables);
        break;
      case 'r':
        result = await sandbox.executeR(code, variables);
        break;
      default:
        return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }

    const duration = Date.now() - startTime;

    // Emit WebSocket update
    WebSocketService.emitExecutionResult(params.id, params.cellId, {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined,
      duration,
    });

    // Audit
    await AuditService.logAuditAction({
      userId: user.id,
      action: 'execute_cell',
      resourceType: 'notebook',
      resourceId: params.id,
      status: result.exitCode === 0 ? 'success' : 'error',
      details: {
        language,
        cellId: params.cellId,
        executionTime: duration,
        memoryUsed: result.memoryUsedMb,
      },
      ipAddress: AuditService.getClientIp(req.headers),
      userAgent: req.headers.get('user-agent') || '',
      duration,
    });

    return NextResponse.json({
      cellId: params.cellId,
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || null,
      executionTime: duration,
      memoryUsed: result.memoryUsedMb,
      cpuTime: result.cpuTimeMs,
    });
  } catch (error: any) {
    console.error('Cell execution error:', error);

    await AuditService.logAuditAction({
      userId: (await authenticateRequest(req))?.id,
      action: 'execute_cell_error',
      resourceType: 'notebook',
      resourceId: params.id,
      status: 'error',
      error: error?.message,
      ipAddress: AuditService.getClientIp(req.headers),
      userAgent: req.headers.get('user-agent') || '',
    });

    return NextResponse.json(
      { error: error?.message || 'Execution failed' },
      { status: 500 }
    );
  }
}
