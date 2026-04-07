/**
 * Real-time Updates API Route
 * 
 * Uses Server-Sent Events (SSE) for real-time updates to clients
 * Clients subscribe to execution/query/cell events and receive live updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import websocketService, {
    WebSocketMessage,
    WebSocketMessageType,
} from '@/src/services/websocketService';
import { rateLimiter } from '@/src/lib/rateLimiting';

/**
 * GET /api/realtime - Subscribe to real-time updates via SSE
 * 
 * Query parameters:
 * - resourceIds: Comma-separated list of resource IDs to subscribe to
 */
export async function GET(request: NextRequest) {
    try {
        // Validate session
        const sessionToken = request.cookies.get('session')?.value;
        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const session = await sessionManager.getSession(sessionToken);
        if (!session || !session.userId) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            );
        }

        // Rate limit SSE connections
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('realtime:subscribe', clientId, 20, 3600);

        const resourceIds = request.nextUrl.searchParams
            .get('resourceIds')
            ?.split(',')
            .filter(Boolean) || [];

        if (resourceIds.length === 0) {
            return NextResponse.json(
                { error: 'No resource IDs specified' },
                { status: 400 }
            );
        }

        const sessionId = crypto.randomUUID();

        // Register connection
        websocketService.registerConnection(sessionId, session.userId);

        // Subscribe to resources
        resourceIds.forEach(resourceId => {
            websocketService.subscribe(sessionId, resourceId);
        });

        // Create SSE stream
        const encoder = new TextEncoder();
        let isClosed = false;

        const customReadable = new ReadableStream({
            async start(controller) {
                // Send connection confirmation
                const connectMsg: WebSocketMessage = {
                    type: WebSocketMessageType.CONNECT,
                    sessionId,
                    userId: session.userId,
                    timestamp: Date.now(),
                    data: {
                        resourceIds,
                    },
                };

                controller.enqueue(encoder.encode(formatSSE(connectMsg)));

                // Message handler
                const onMessage = (event: any) => {
                    if (!isClosed) {
                        try {
                            const sse = formatSSE(event.message);
                            controller.enqueue(encoder.encode(sse));
                        } catch (error) {
                            console.error('Error sending SSE:', error);
                        }
                    }
                };

                // Subscription handler
                const onSubscription = (event: any) => {
                    if (event.sessionId === sessionId && !isClosed) {
                        const msg: WebSocketMessage = {
                            type: WebSocketMessageType.CONNECT,
                            sessionId,
                            timestamp: Date.now(),
                            data: {
                                resourceId: event.resourceId,
                                action: 'subscribed',
                            },
                        };
                        try {
                            controller.enqueue(encoder.encode(formatSSE(msg)));
                        } catch (error) {
                            console.error('Error sending subscription confirm:', error);
                        }
                    }
                };

                websocketService.on('message:send', (event: any) => {
                    if (event.sessionId === sessionId) {
                        onMessage(event);
                    }
                });

                websocketService.on('message:broadcast', (event: any) => {
                    if (event.sessionIds.includes(sessionId)) {
                        onMessage(event);
                    }
                });

                websocketService.on('subscription:added', onSubscription);

                // Heartbeat
                const heartbeatInterval = setInterval(() => {
                    if (!isClosed) {
                        websocketService.updateHeartbeat(sessionId);
                        const heartbeat: WebSocketMessage = {
                            type: WebSocketMessageType.HEARTBEAT,
                            sessionId,
                            timestamp: Date.now(),
                        };
                        try {
                            controller.enqueue(encoder.encode(formatSSE(heartbeat)));
                        } catch (error) {
                            console.error('Error sending heartbeat:', error);
                        }
                    }
                }, 30000); // Every 30 seconds

                // Cleanup on close
                const cleanup = () => {
                    if (!isClosed) {
                        isClosed = true;
                        clearInterval(heartbeatInterval);
                        websocketService.unregisterConnection(sessionId);
                        websocketService.removeAllListeners();

                        try {
                            controller.close();
                        } catch (error) {
                            console.error('Error closing SSE stream:', error);
                        }
                    }
                };

                request.signal.addEventListener('abort', cleanup);
            },
        });

        return new NextResponse(customReadable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error: any) {
        console.error('Error in SSE endpoint:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to establish connection' },
            { status: 500 }
        );
    }
}

/**
 * Format message as SSE
 */
function formatSSE(message: WebSocketMessage): string {
    const data = JSON.stringify(message);
    return `data: ${data}\n\n`;
}
