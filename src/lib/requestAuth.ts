import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

interface JwtPayload {
    userId?: string;
    email?: string;
    name?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'mastiff-ai-secret-key-change-in-production';

function parseBearerToken(request: NextRequest): string | null {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return null;

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
}

export function getUserIdFromRequest(request: NextRequest): string | null {
    const userIdHeader = request.headers.get('x-user-id');
    if (userIdHeader) return userIdHeader;

    const token = parseBearerToken(request);
    if (token) {
        try {
            const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
            if (payload?.userId) return payload.userId;
        } catch {
            // Ignore token parsing failures and fall through to query param fallback.
        }
    }

    const userIdParam = request.nextUrl.searchParams.get('userId');
    if (userIdParam) return userIdParam;

    return null;
}
