/**
 * useRealtime Hook
 * 
 * React hook for subscribing to real-time updates via SSE
 * Provides connection management and message handling
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { WebSocketMessage, WebSocketMessageType } from '@/src/services/websocketService';

interface UseRealtimeOptions {
    resourceIds: string[];
    onMessage?: (message: WebSocketMessage) => void;
    onError?: (error: Error) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    autoReconnect?: boolean;
    reconnectDelay?: number;
}

interface UseRealtimeState {
    connected: boolean;
    error: Error | null;
    reconnectAttempts: number;
}

/**
 * Hook for real-time SSE updates
 */
export function useRealtime(options: UseRealtimeOptions) {
    const {
        resourceIds,
        onMessage,
        onError,
        onConnect,
        onDisconnect,
        autoReconnect = true,
        reconnectDelay = 3000,
    } = options;

    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [state, setState] = useState<UseRealtimeState>({
        connected: false,
        error: null,
        reconnectAttempts: 0,
    });

    const connect = useCallback(() => {
        if (eventSourceRef.current) {
            return; // Already connected
        }

        if (resourceIds.length === 0) {
            return;
        }

        try {
            const resourceIdsParam = resourceIds.join(',');
            const url = `/api/realtime?resourceIds=${encodeURIComponent(resourceIdsParam)}`;

            const eventSource = new EventSource(url);

            eventSource.addEventListener('open', () => {
                console.log('[Realtime] Connected');
                setState(prev => ({
                    ...prev,
                    connected: true,
                    error: null,
                    reconnectAttempts: 0,
                }));
                onConnect?.();
            });

            eventSource.addEventListener('message', (event: MessageEvent) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    onMessage?.(message);
                } catch (error) {
                    console.error('[Realtime] Failed to parse message:', error);
                }
            });

            eventSource.addEventListener('error', () => {
                console.error('[Realtime] Connection error');
                setState(prev => ({
                    ...prev,
                    connected: false,
                    error: new Error('Connection error'),
                }));
                onError?.(new Error('Connection error'));
                eventSource.close();
                eventSourceRef.current = null;

                // Attempt reconnection
                if (autoReconnect) {
                    setState(prev => ({
                        ...prev,
                        reconnectAttempts: prev.reconnectAttempts + 1,
                    }));

                    const delay = reconnectDelay * Math.pow(1.5, state.reconnectAttempts);
                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect();
                    }, delay);
                }
            });

            eventSourceRef.current = eventSource;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            setState(prev => ({
                ...prev,
                error: err,
            }));
            onError?.(err);
        }
    }, [resourceIds, onMessage, onError, onConnect, autoReconnect, reconnectDelay, state.reconnectAttempts]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        setState(prev => ({
            ...prev,
            connected: false,
        }));
        onDisconnect?.();
    }, [onDisconnect]);

    const subscribe = useCallback((newResourceIds: string[]) => {
        // For now, disconnect and reconnect with new resource IDs
        // In a production system, you might want to handle dynamic subscriptions
        disconnect();
        resourceIds.splice(0, resourceIds.length, ...newResourceIds);
        connect();
    }, [connect, disconnect, resourceIds]);

    useEffect(() => {
        if (resourceIds.length > 0) {
            connect();
        }

        return () => {
            disconnect();
        };
    }, [resourceIds.length, connect, disconnect]);

    return {
        connected: state.connected,
        error: state.error,
        reconnectAttempts: state.reconnectAttempts,
        disconnect,
        subscribe,
    };
}

/**
 * Hook for listening to specific message types
 */
export function useRealtimeMessages(
    resourceIds: string[],
    messageTypes?: WebSocketMessageType[]
) {
    const [messages, setMessages] = useState<WebSocketMessage[]>([]);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

    const handleMessage = useCallback((message: WebSocketMessage) => {
        if (!messageTypes || messageTypes.includes(message.type)) {
            setMessages(prev => [...prev, message]);
            setLastMessage(message);
        }
    }, [messageTypes]);

    const { connected, error } = useRealtime({
        resourceIds,
        onMessage: handleMessage,
    });

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    return {
        messages,
        lastMessage,
        connected,
        error,
        clearMessages,
    };
}

/**
 * Hook for tracking execution progress
 */
export function useExecutionProgress(executionId: string) {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
    const [currentStep, setCurrentStep] = useState<string | null>(null);
    const [output, setOutput] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const startTimeRef = useRef<number | null>(null);

    const handleMessage = useCallback((message: WebSocketMessage) => {
        switch (message.type) {
            case WebSocketMessageType.EXECUTION_START:
                startTimeRef.current = Date.now();
                setStatus('running');
                setProgress(0);
                setError(null);
                break;

            case WebSocketMessageType.EXECUTION_STEP_START:
                setCurrentStep(message.data?.stepId);
                break;

            case WebSocketMessageType.EXECUTION_STEP_COMPLETE:
                setProgress(prev => Math.min(100, prev + 10));
                break;

            case WebSocketMessageType.EXECUTION_STEP_ERROR:
                setError(message.data?.error);
                setStatus('failed');
                break;

            case WebSocketMessageType.EXECUTION_COMPLETE:
                setStatus('completed');
                setProgress(100);
                setOutput(message.data?.output);
                if (startTimeRef.current) {
                    setDuration(Date.now() - startTimeRef.current);
                }
                break;

            case WebSocketMessageType.EXECUTION_ERROR:
                setStatus('failed');
                setError(message.error || 'Execution failed');
                if (startTimeRef.current) {
                    setDuration(Date.now() - startTimeRef.current);
                }
                break;
        }
    }, []);

    const { connected } = useRealtime({
        resourceIds: [executionId],
        onMessage: handleMessage,
    });

    const reset = useCallback(() => {
        setProgress(0);
        setStatus('idle');
        setCurrentStep(null);
        setOutput(null);
        setError(null);
        setDuration(0);
        startTimeRef.current = null;
    }, []);

    return {
        progress,
        status,
        currentStep,
        output,
        error,
        duration,
        connected,
        reset,
    };
}

/**
 * Hook for query result streaming
 */
export function useQueryStreaming(queryId: string) {
    const [rows, setRows] = useState<any[]>([]);
    const [totalRows, setTotalRows] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleMessage = useCallback((message: WebSocketMessage) => {
        switch (message.type) {
            case WebSocketMessageType.QUERY_START:
                setIsLoading(true);
                setRows([]);
                setError(null);
                break;

            case WebSocketMessageType.QUERY_RESULT:
                setRows(prev => [...prev, ...message.data?.rows || []]);
                setTotalRows(message.data?.totalRows || 0);
                break;

            case WebSocketMessageType.QUERY_ERROR:
                setError(message.error || 'Query failed');
                setIsLoading(false);
                break;

            case WebSocketMessageType.EXECUTION_COMPLETE:
                setIsLoading(false);
                break;
        }
    }, []);

    const { connected } = useRealtime({
        resourceIds: [queryId],
        onMessage: handleMessage,
    });

    const clear = useCallback(() => {
        setRows([]);
        setTotalRows(0);
        setError(null);
    }, []);

    return {
        rows,
        totalRows,
        isLoading,
        error,
        connected,
        clear,
    };
}
