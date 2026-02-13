/**
 * WebSocket Service
 * 
 * Manages real-time connections for template execution, query execution, and notebook operations
 */

import { EventEmitter } from 'events';

/**
 * Message types for WebSocket communication
 */
export enum WebSocketMessageType {
    // Connection lifecycle
    CONNECT = 'connect',
    DISCONNECT = 'disconnect',
    HEARTBEAT = 'heartbeat',
    
    // Execution lifecycle
    EXECUTION_START = 'execution:start',
    EXECUTION_PROGRESS = 'execution:progress',
    EXECUTION_STEP_START = 'execution:step_start',
    EXECUTION_STEP_COMPLETE = 'execution:step_complete',
    EXECUTION_STEP_ERROR = 'execution:step_error',
    EXECUTION_COMPLETE = 'execution:complete',
    EXECUTION_ERROR = 'execution:error',
    
    // Query execution
    QUERY_START = 'query:start',
    QUERY_PROGRESS = 'query:progress',
    QUERY_RESULT = 'query:result',
    QUERY_ERROR = 'query:error',
    
    // Notebook execution
    CELL_START = 'cell:start',
    CELL_EXECUTING = 'cell:executing',
    CELL_OUTPUT = 'cell:output',
    CELL_COMPLETE = 'cell:complete',
    CELL_ERROR = 'cell:error',
}

/**
 * WebSocket message structure
 */
export interface WebSocketMessage {
    type: WebSocketMessageType;
    id?: string;                    // Execution/query/cell ID
    sessionId?: string;              // WebSocket session ID
    userId?: string;                 // User ID
    timestamp: number;
    data?: any;
    error?: string;
    progress?: number;              // 0-100
    status?: 'running' | 'completed' | 'failed';
}

/**
 * Connection metadata
 */
interface ConnectionMetadata {
    sessionId: string;
    userId: string;
    connectedAt: number;
    lastHeartbeat: number;
    subscriptions: Set<string>;     // Templates/notebooks/queries subscribed to
}

/**
 * WebSocket Service - Handles real-time connections
 */
export class WebSocketService extends EventEmitter {
    private static instance: WebSocketService;
    private connections: Map<string, ConnectionMetadata> = new Map();
    private executionSubscribers: Map<string, Set<string>> = new Map();
    private heartbeatInterval: NodeJS.Timeout | null = null;

    private constructor() {
        super();
        this.startHeartbeat();
    }

    /**
     * Get singleton instance
     */
    static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    /**
     * Register a new connection
     */
    registerConnection(sessionId: string, userId: string): void {
        this.connections.set(sessionId, {
            sessionId,
            userId,
            connectedAt: Date.now(),
            lastHeartbeat: Date.now(),
            subscriptions: new Set(),
        });

        this.emit('connection:registered', { sessionId, userId });
    }

    /**
     * Unregister a connection
     */
    unregisterConnection(sessionId: string): void {
        const metadata = this.connections.get(sessionId);
        if (metadata) {
            // Unsubscribe from all resources
            metadata.subscriptions.forEach(resourceId => {
                this.unsubscribe(sessionId, resourceId);
            });

            this.connections.delete(sessionId);
            this.emit('connection:closed', { sessionId });
        }
    }

    /**
     * Update heartbeat for connection
     */
    updateHeartbeat(sessionId: string): void {
        const metadata = this.connections.get(sessionId);
        if (metadata) {
            metadata.lastHeartbeat = Date.now();
        }
    }

    /**
     * Subscribe to execution updates
     */
    subscribe(sessionId: string, resourceId: string): void {
        const metadata = this.connections.get(sessionId);
        if (metadata) {
            metadata.subscriptions.add(resourceId);

            // Initialize subscribers for this resource
            if (!this.executionSubscribers.has(resourceId)) {
                this.executionSubscribers.set(resourceId, new Set());
            }
            this.executionSubscribers.get(resourceId)!.add(sessionId);

            this.emit('subscription:added', { sessionId, resourceId });
        }
    }

    /**
     * Unsubscribe from execution updates
     */
    unsubscribe(sessionId: string, resourceId: string): void {
        const metadata = this.connections.get(sessionId);
        if (metadata) {
            metadata.subscriptions.delete(resourceId);
        }

        const subscribers = this.executionSubscribers.get(resourceId);
        if (subscribers) {
            subscribers.delete(sessionId);
            if (subscribers.size === 0) {
                this.executionSubscribers.delete(resourceId);
            }
        }

        this.emit('subscription:removed', { sessionId, resourceId });
    }

    /**
     * Get all subscribers for a resource
     */
    getSubscribers(resourceId: string): string[] {
        const subscribers = this.executionSubscribers.get(resourceId);
        return subscribers ? Array.from(subscribers) : [];
    }

    /**
     * Get connection metadata
     */
    getConnection(sessionId: string): ConnectionMetadata | undefined {
        return this.connections.get(sessionId);
    }

    /**
     * Get all connections
     */
    getAllConnections(): Map<string, ConnectionMetadata> {
        return this.connections;
    }

    /**
     * Broadcast message to specific subscribers
     */
    broadcast(message: WebSocketMessage, sessionIds: string[]): void {
        this.emit('message:broadcast', {
            message,
            sessionIds,
            timestamp: Date.now(),
        });
    }

    /**
     * Broadcast to all subscribers of a resource
     */
    broadcastToResource(resourceId: string, message: WebSocketMessage): void {
        const subscribers = this.getSubscribers(resourceId);
        this.broadcast(message, subscribers);
    }

    /**
     * Send message to specific connection
     */
    sendToConnection(sessionId: string, message: WebSocketMessage): void {
        this.emit('message:send', {
            sessionId,
            message,
            timestamp: Date.now(),
        });
    }

    /**
     * Notify execution start
     */
    notifyExecutionStart(
        executionId: string,
        executionType: 'template' | 'notebook' | 'query',
        metadata?: any
    ): void {
        const message: WebSocketMessage = {
            type: WebSocketMessageType.EXECUTION_START,
            id: executionId,
            timestamp: Date.now(),
            data: {
                executionType,
                ...metadata,
            },
            status: 'running',
        };

        this.broadcastToResource(executionId, message);
    }

    /**
     * Notify step progress
     */
    notifyStepStart(
        executionId: string,
        stepId: string,
        stepName: string
    ): void {
        const message: WebSocketMessage = {
            type: WebSocketMessageType.EXECUTION_STEP_START,
            id: executionId,
            timestamp: Date.now(),
            data: {
                stepId,
                stepName,
            },
            status: 'running',
        };

        this.broadcastToResource(executionId, message);
    }

    /**
     * Notify step completion
     */
    notifyStepComplete(
        executionId: string,
        stepId: string,
        duration: number,
        output?: any
    ): void {
        const message: WebSocketMessage = {
            type: WebSocketMessageType.EXECUTION_STEP_COMPLETE,
            id: executionId,
            timestamp: Date.now(),
            data: {
                stepId,
                duration,
                output,
            },
            status: 'completed',
        };

        this.broadcastToResource(executionId, message);
    }

    /**
     * Notify step error
     */
    notifyStepError(
        executionId: string,
        stepId: string,
        error: string
    ): void {
        const message: WebSocketMessage = {
            type: WebSocketMessageType.EXECUTION_STEP_ERROR,
            id: executionId,
            timestamp: Date.now(),
            data: {
                stepId,
                error,
            },
            status: 'failed',
        };

        this.broadcastToResource(executionId, message);
    }

    /**
     * Notify query result streaming
     */
    notifyQueryResult(
        queryId: string,
        rows: any[],
        totalRows: number,
        offset: number
    ): void {
        const message: WebSocketMessage = {
            type: WebSocketMessageType.QUERY_RESULT,
            id: queryId,
            timestamp: Date.now(),
            data: {
                rows,
                totalRows,
                offset,
            },
            progress: Math.min(100, Math.floor((offset + rows.length) / totalRows * 100)),
        };

        this.broadcastToResource(queryId, message);
    }

    /**
     * Notify cell output
     */
    notifyCellOutput(
        cellId: string,
        outputType: 'stdout' | 'stderr' | 'result',
        content: string,
        mimeType?: string
    ): void {
        const message: WebSocketMessage = {
            type: WebSocketMessageType.CELL_OUTPUT,
            id: cellId,
            timestamp: Date.now(),
            data: {
                outputType,
                content,
                mimeType,
            },
        };

        this.broadcastToResource(cellId, message);
    }

    /**
     * Notify execution completion
     */
    notifyExecutionComplete(
        executionId: string,
        duration: number,
        output?: any
    ): void {
        const message: WebSocketMessage = {
            type: WebSocketMessageType.EXECUTION_COMPLETE,
            id: executionId,
            timestamp: Date.now(),
            data: {
                duration,
                output,
            },
            status: 'completed',
        };

        this.broadcastToResource(executionId, message);
    }

    /**
     * Notify execution error
     */
    notifyExecutionError(
        executionId: string,
        error: string,
        duration: number
    ): void {
        const message: WebSocketMessage = {
            type: WebSocketMessageType.EXECUTION_ERROR,
            id: executionId,
            timestamp: Date.now(),
            error,
            data: {
                duration,
            },
            status: 'failed',
        };

        this.broadcastToResource(executionId, message);
    }

    /**
     * Start heartbeat to detect dead connections
     */
    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            const timeout = 30000; // 30 seconds

            this.connections.forEach((metadata, sessionId) => {
                if (now - metadata.lastHeartbeat > timeout) {
                    console.warn(`Connection timeout: ${sessionId}`);
                    this.unregisterConnection(sessionId);
                    this.emit('connection:timeout', { sessionId });
                }
            });
        }, 10000); // Check every 10 seconds
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Get statistics
     */
    getStats(): {
        activeConnections: number;
        totalSubscriptions: number;
        activeResources: number;
    } {
        let totalSubscriptions = 0;
        this.connections.forEach(metadata => {
            totalSubscriptions += metadata.subscriptions.size;
        });

        return {
            activeConnections: this.connections.size,
            totalSubscriptions,
            activeResources: this.executionSubscribers.size,
        };
    }

    /**
     * Cleanup on shutdown
     */
    shutdown(): void {
        this.stopHeartbeat();
        this.connections.clear();
        this.executionSubscribers.clear();
        this.removeAllListeners();
    }
}

export default WebSocketService.getInstance();
