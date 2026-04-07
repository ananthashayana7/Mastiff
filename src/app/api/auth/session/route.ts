import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = await getSessionUser(request);
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isAdmin: Boolean(user.isAdmin),
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to load session' }, { status: 500 });
    }
}