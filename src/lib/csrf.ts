import { NextRequest, NextResponse } from 'next/server';
import { validateCSRFToken } from '@/services/csrfProtection';

export async function validateCSRFRequest(request: NextRequest): Promise<{
  valid: boolean;
  error?: string;
}> {
  return validateCSRFToken(request);
}

export function withCSRFProtection(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (stateChangingMethods.includes(request.method.toUpperCase())) {
      const validation = await validateCSRFToken(request);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || 'Invalid CSRF token' },
          { status: 403 }
        );
      }
    }

    return handler(request);
  };
}
