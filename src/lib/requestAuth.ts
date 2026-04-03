import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

interface JwtPayload {
    userId?: string;
    email?: string;
    name?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'mastiff-ai-secret-key-change-in-production';

export function shouldAllowHeaderIdentityFallback(): boolean {
    return process.env.ALLOW_HEADER_AUTH === 'true' || process.env.NODE_ENV !== 'production';
}

function parseBearerToken(request: NextRequest): string | null {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return null;

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
}

export function getUserIdFromRequest(request: NextRequest): string | null {
    const token = parseBearerToken(request);
    if (token) {
        try {
            const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
            if (payload?.userId) return payload.userId;
        } catch {
            // Ignore token parsing failures and fall through to header fallback.
        }
    }

    if (shouldAllowHeaderIdentityFallback()) {
        const userIdHeader = request.headers.get('x-user-id');
        if (userIdHeader) return userIdHeader;
    }

    return null;
}
