/**
 * Error Handling & Custom Errors
 *
 * Structured error handling for the application
 */

import { NextResponse } from 'next/server';

/**
 * Custom error types
 */
export class AppError extends Error {
    public statusCode: number;
    public code: string;
    public details?: unknown;

    constructor(
        messageOrCode: string,
        statusCodeOrMessage: number | string = 500,
        codeOrDetails: string | unknown = 'INTERNAL_ERROR',
        maybeDetails?: unknown
    ) {
        if (typeof statusCodeOrMessage === 'string') {
            super(statusCodeOrMessage);
            this.name = 'AppError';
            this.statusCode = 500;
            this.code = messageOrCode;
            this.details = maybeDetails ?? codeOrDetails;
            return;
        }

        super(messageOrCode);
        this.name = 'AppError';
        this.statusCode = statusCodeOrMessage;
        this.code = typeof codeOrDetails === 'string' ? codeOrDetails : 'INTERNAL_ERROR';
        this.details = typeof codeOrDetails === 'string' ? maybeDetails : codeOrDetails;
    }
}

export class ValidationError extends AppError {
    constructor(message: string) {
        super(message, 400, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required') {
        super(message, 401, 'AUTHENTICATION_ERROR');
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Insufficient permissions') {
        super(message, 403, 'AUTHORIZATION_ERROR');
        this.name = 'AuthorizationError';
    }
}

export class NotFoundError extends AppError {
    constructor(message: string = 'Resource not found') {
        super(message, 404, 'NOT_FOUND');
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends AppError {
    constructor(message: string = 'Resource already exists') {
        super(message, 409, 'CONFLICT');
        this.name = 'ConflictError';
    }
}

export class RateLimitError extends AppError {
    constructor(message: string = 'Rate limit exceeded') {
        super(message, 429, 'RATE_LIMIT_EXCEEDED');
        this.name = 'RateLimitError';
    }
}

/**
 * Convert error to API response
 */
export function errorToResponse(error: any): NextResponse {
    if (error instanceof AppError) {
        return NextResponse.json(
            {
                error: error.message,
                code: error.code,
                details: error.details,
            },
            { status: error.statusCode }
        );
    }

    console.error('Unhandled error:', error);

    return NextResponse.json(
        {
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
        },
        { status: 500 }
    );
}

/**
 * Safe API handler wrapper
 */
export function withErrorHandling(
    handler: (req: any) => Promise<NextResponse>
) {
    return async (req: any) => {
        try {
            return await handler(req);
        } catch (error) {
            return errorToResponse(error);
        }
    };
}
