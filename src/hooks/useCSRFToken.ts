/**
 * Hook for CSRF Token Management
 * 
 * Provides utilities for managing CSRF tokens on the client side
 */

'use client';

import { useEffect, useState } from 'react';

const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_KEY = 'csrf_token';

/**
 * Hook to fetch and manage CSRF token
 * Call this on app initialization (in layout or wrapper component)
 */
export function useCSRFToken() {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchToken = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/csrf-token', {
                    credentials: 'same-origin',
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch CSRF token: ${response.statusText}`);
                }

                const data = await response.json();
                setToken(data.token);
                // Optionally store in sessionStorage
                if (typeof window !== 'undefined') {
                    sessionStorage.setItem(CSRF_TOKEN_KEY, data.token);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                setError(message);
                console.error('CSRF token fetch error:', message);
            } finally {
                setLoading(false);
            }
        };

        fetchToken();
    }, []);

    return {
        token,
        loading,
        error,
        isReady: !loading && token !== null,
    };
}

/**
 * Hook for making CSRF-protected requests
 * Automatically includes CSRF token in request headers
 */
export function useCSRFProtectedFetch() {
    const { token } = useCSRFToken();

    const fetchWithCSRF = async (
        url: string,
        options: RequestInit = {}
    ): Promise<Response> => {
        if (!token) {
            throw new Error('CSRF token not available');
        }

        const headers = new Headers(options.headers);
        headers.set(CSRF_HEADER_NAME, token);

        return fetch(url, {
            ...options,
            headers,
        });
    };

    return { fetchWithCSRF, token };
}

/**
 * Utility function to add CSRF token to request
 * Use this for manual requests where hooks can't be used
 */
export function addCSRFTokenToHeaders(headers: HeadersInit = {}): HeadersInit {
    if (typeof window === 'undefined') {
        return headers;
    }

    const token = sessionStorage.getItem(CSRF_TOKEN_KEY);
    if (!token) {
        console.warn('CSRF token not found in sessionStorage');
        return headers;
    }

    return {
        ...headers,
        [CSRF_HEADER_NAME]: token,
    };
}

/**
 * Enhanced fetch wrapper with CSRF protection
 * Usage: await csrfFetch('/api/endpoint', { method: 'POST', body: ... })
 */
export async function csrfFetch(
    url: string,
    options: RequestInit = {},
    retryOnCsrfFailure = true
): Promise<Response> {
    const token = sessionStorage.getItem(CSRF_TOKEN_KEY);

    if (!token) {
        console.warn('CSRF token not found. Fetching new token...');
        // Try to fetch a new token before making the request
        const tokenResponse = await fetch('/api/csrf-token', {
            credentials: 'same-origin',
        });
        if (tokenResponse.ok) {
            const data = await tokenResponse.json();
            sessionStorage.setItem(CSRF_TOKEN_KEY, data.token);
            return csrfFetch(url, options, false);
        }
        throw new Error('Failed to obtain CSRF token');
    }

    const headers = new Headers(options.headers);
    headers.set(CSRF_HEADER_NAME, token);

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: options.credentials ?? 'same-origin',
    });

    if (retryOnCsrfFailure && response.status === 403) {
        const payload = await response.clone().json().catch(() => null);
        const errorMessage = typeof payload?.error === 'string' ? payload.error : typeof payload?.message === 'string' ? payload.message : '';

        if (errorMessage.toLowerCase().includes('csrf')) {
            const tokenResponse = await fetch('/api/csrf-token', {
                credentials: 'same-origin',
            });

            if (tokenResponse.ok) {
                const data = await tokenResponse.json();
                sessionStorage.setItem(CSRF_TOKEN_KEY, data.token);
                return csrfFetch(url, options, false);
            }
        }
    }

    return response;
}

/**
 * Hook for form submission with CSRF protection
 */
export function useFormWithCSRF() {
    const { token } = useCSRFToken();

    const handleSubmit = async (
        e: React.FormEvent<HTMLFormElement>,
        onSubmit: (data: FormData) => Promise<void>
    ) => {
        e.preventDefault();

        if (!token) {
            console.error('CSRF token not available');
            return;
        }

        const form = e.currentTarget;
        const formData = new FormData(form);

        // Add CSRF token to form data
        formData.append('_csrf', token);

        try {
            await onSubmit(formData);
        } catch (err) {
            console.error('Form submission error:', err);
        }
    };

    return { handleSubmit, token };
}
