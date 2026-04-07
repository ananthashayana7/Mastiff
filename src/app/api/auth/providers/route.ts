import { NextResponse } from 'next/server';
import { isMicrosoftAuthEnabled } from '../../../../lib/microsoftAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        microsoft: isMicrosoftAuthEnabled(),
    });
}