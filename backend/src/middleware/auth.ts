import type { Request } from 'express';
import jwt from 'jsonwebtoken';

interface JwtPayload {
  userId?: string;
  id?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'mastiff-ai-secret-key-change-in-production';

function parseBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

export function allowHeaderIdentityFallback(): boolean {
  return process.env.ALLOW_HEADER_AUTH === 'true' || process.env.NODE_ENV !== 'production';
}

export function resolveRequestUserId(req: Request): string | null {
  const bearer = parseBearerToken(req.header('authorization') || undefined);
  if (bearer) {
    try {
      const payload = jwt.verify(bearer, JWT_SECRET) as JwtPayload;
      if (payload?.userId) return payload.userId;
      if (payload?.id) return payload.id;
    } catch {
      // Ignore invalid bearer token and continue only when fallback is explicitly allowed.
    }
  }

  if (!allowHeaderIdentityFallback()) {
    return null;
  }

  const userIdHeader = req.header('x-user-id');
  if (!userIdHeader) return null;

  const trimmed = String(userIdHeader).trim();
  return trimmed || null;
}
