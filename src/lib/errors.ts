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
    constructor(
        public message: string,
        public statusCode: number = 500,
        public code: string = 'INTERNAL_ERROR'
    ) {
        super(message);
        this.name = 'AppError';
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
            },
            { status: error.statusCode }
        );
    }

    // Unknown error
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
