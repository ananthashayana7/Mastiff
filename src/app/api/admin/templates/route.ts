import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import TemplateService from '@/src/services/templateService';
import { rateLimiter } from '@/src/lib/rateLimiting';

export const dynamic = 'force-dynamic';

async function requireAdmin(req: NextRequest) {
    const sessionToken = req.cookies.get('session')?.value;
    if (!sessionToken) throw new Error('Unauthorized');
    const session = await sessionManager.getSession(sessionToken);
    if (!session || !session.userId || !session.isAdmin) throw new Error('Forbidden');
    return session;
}

export async function GET(req: NextRequest) {
    try {
        await rateLimiter.checkLimit('admin:templates:list', req.ip || 'unknown', 50, 60);
        await requireAdmin(req);
        const templates = await TemplateService.listTemplates({ limit: 200 });
        const ids = templates.map((t: any) => t.id).filter(Boolean);
        const counts = await TemplateService.getScheduledReportCounts(ids);
        const enriched = templates.map((t: any) => ({ ...t, scheduledCount: counts[t.id] || 0 }));
        return NextResponse.json({ success: true, templates: enriched });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Unauthorized' }, { status: 401 });
    }
}

export async function POST(req: NextRequest) {
    try {
        await rateLimiter.checkLimit('admin:templates:seed', req.ip || 'unknown', 10, 60);
        const session = await requireAdmin(req);
        const body = await req.json();
        const action = body.action || 'seed';

        if (action === 'seed') {
            const systemUserId = body.systemUserId || process.env.SYSTEM_USER_ID;
            if (!systemUserId) return NextResponse.json({ error: 'Missing systemUserId' }, { status: 400 });
            await TemplateService.seedSystemTemplates(systemUserId);
            return NextResponse.json({ success: true, message: 'Seed completed' });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Forbidden' }, { status: 403 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        await rateLimiter.checkLimit('admin:templates:update', req.ip || 'unknown', 20, 60);
        await requireAdmin(req);
        const body = await req.json();
        const { templateId, updates } = body;
        if (!templateId || !updates) return NextResponse.json({ error: 'Missing templateId or updates' }, { status: 400 });
        await TemplateService.updateTemplate(templateId, updates.userId || process.env.SYSTEM_USER_ID!, updates);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Forbidden' }, { status: 403 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        await rateLimiter.checkLimit('admin:templates:delete', req.ip || 'unknown', 10, 60);
        await requireAdmin(req);
        const templateId = req.nextUrl.searchParams.get('id') || (await req.json()).id;
        if (!templateId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        await TemplateService.deleteTemplate(templateId, process.env.SYSTEM_USER_ID!);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Forbidden' }, { status: 403 });
    }
}
