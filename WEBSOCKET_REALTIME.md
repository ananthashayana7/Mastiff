# WebSocket Real-time Updates

## Overview

The WebSocket system provides real-time updates for template execution, query execution, and notebook operations. Updates are delivered via Server-Sent Events (SSE) which provides better compatibility with Next.js while maintaining real-time capabilities.

**Key Features:**
- Real-time execution status updates
- Step-by-step progress tracking
- Query result streaming
- Cell output streaming
- Error notifications
- Automatic reconnection with exponential backoff
- Session-based message routing

## Architecture

### Components

```
┌─────────────────────────────────────────┐
│     Client (Browser)                    │
│  ┌─────────────────────────────────────┐│
│  │  React Hooks (useRealtime, etc)     ││
│  │  - useRealtime()                    ││
│  │  - useExecutionProgress()           ││
│  │  - useQueryStreaming()              ││
│  │  - useRealtimeMessages()            ││
│  └─────────────────────────────────────┘│
│            │                            │
│            │ SSE Connection             │
│            ▼                            │
│  ┌─────────────────────────────────────┐│
│  │  EventSource (/api/realtime)        ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
           │
           │ HTTP/1.1 SSE Stream
           │
┌──────────▼──────────────────────────────┐
│     Server (Next.js)                    │
│  ┌─────────────────────────────────────┐│
│  │  /api/realtime Route Handler        ││
│  │  - SSE stream management            ││
│  │  - Message encoding                 ││
│  │  - Session validation               ││
│  │  - Rate limiting                    ││
│  └─────────────────────────────────────┘│
│            │                            │
│            ▼                            │
│  ┌─────────────────────────────────────┐│
│  │  WebSocketService (Singleton)       ││
│  │  - Connection registry              ││
│  │  - Message routing                  ││
│  │  - Subscription management          ││
│  │  - Event emission                   ││
│  └─────────────────────────────────────┘│
│            │                            │
│            ▼                            │
│  ┌─────────────────────────────────────┐│
│  │  Template/Query/Cell Services       ││
│  │  - Execute with notifications       ││
│  │  - Stream results                   ││
│  │  - Send progress updates            ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### Message Types

```typescript
enum WebSocketMessageType {
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
```

## Client-Side Usage

### 1. Basic Real-time Subscription

```typescript
import { useRealtime } from '@/src/hooks/useRealtime';

export function MyComponent() {
    const { connected, error } = useRealtime({
        resourceIds: ['template-123', 'query-456'],
        onMessage: (message) => {
            console.log('Received:', message);
        },
        onError: (error) => {
            console.error('Connection error:', error);
        },
    });

    return (
        <div>
            Status: {connected ? 'Connected ✓' : 'Disconnected ✗'}
            {error && <p>Error: {error.message}</p>}
        </div>
    );
}
```

### 2. Track Execution Progress

```typescript
import { useExecutionProgress } from '@/src/hooks/useRealtime';

export function TemplateExecution() {
    const {
        progress,           // 0-100
        status,             // 'idle' | 'running' | 'completed' | 'failed'
        currentStep,        // Current step ID
        output,             // Final output when completed
        error,              // Error message if failed
        duration,           // Execution time in ms
        connected,          // Connection status
    } = useExecutionProgress('execution-uuid-123');

    return (
        <div>
            <progress value={progress} max={100} />
            <p>Status: {status}</p>
            <p>Step: {currentStep}</p>
            {error && <p className="error">{error}</p>}
            {output && <pre>{JSON.stringify(output, null, 2)}</pre>}
        </div>
    );
}
```

### 3. Stream Query Results

```typescript
import { useQueryStreaming } from '@/src/hooks/useRealtime';

export function LiveQueryResults() {
    const {
        rows,              // Array of result rows
        totalRows,         // Total row count
        isLoading,         // Still receiving data?
        error,             // Error message if failed
        connected,         // Connection status
    } = useQueryStreaming('query-uuid-456');

    return (
        <div>
            <p>Loaded {rows.length} / {totalRows} rows</p>
            {isLoading && <p>Loading...</p>}
            <table>
                {rows.map((row, idx) => (
                    <tr key={idx}>
                        {Object.values(row).map((val, i) => (
                            <td key={i}>{val}</td>
                        ))}
                    </tr>
                ))}
            </table>
        </div>
    );
}
```

### 4. Listen to Specific Message Types

```typescript
import { useRealtimeMessages, WebSocketMessageType } from '@/src/hooks/useRealtime';

export function StepMonitor() {
    const { messages, lastMessage, connected } = useRealtimeMessages(
        ['execution-uuid-123'],
        [
            WebSocketMessageType.EXECUTION_STEP_START,
            WebSocketMessageType.EXECUTION_STEP_COMPLETE,
            WebSocketMessageType.EXECUTION_STEP_ERROR,
        ]
    );

    return (
        <div>
            <h3>Steps ({messages.length})</h3>
            {messages.map((msg, idx) => (
                <div key={idx}>
                    {msg.type}: {msg.data?.stepId}
                </div>
            ))}
            {lastMessage && (
                <p>Last: {lastMessage.type} at {new Date(lastMessage.timestamp).toLocaleTimeString()}</p>
            )}
        </div>
    );
}
```

## Server-Side Integration

### Emit Notifications from Services

```typescript
import websocketService from '@/src/services/websocketService';

// Execution started
websocketService.notifyExecutionStart('exec-123', 'template', {
    templateId: 'tmpl-456',
});

// Step started
websocketService.notifyStepStart('exec-123', 'step-1', 'Fetch Data');

// Step completed
websocketService.notifyStepComplete('exec-123', 'step-1', 1234, {
    rowsAffected: 1000,
});

// Step error
websocketService.notifyStepError('exec-123', 'step-1', 'Connection timeout');

// Query result chunk
websocketService.notifyQueryResult('query-456', rows, 10000, offset);

// Cell output
websocketService.notifyCellOutput('cell-789', 'stdout', 'Processing...');

// Execution complete
websocketService.notifyExecutionComplete('exec-123', 5000, {
    result: {...}
});

// Execution error
websocketService.notifyExecutionError('exec-123', 'Memory limit exceeded', 3000);
```

## API Endpoint

### GET /api/realtime

Subscribe to real-time updates via Server-Sent Events (SSE).

**Query Parameters:**
- `resourceIds` (required): Comma-separated list of resource IDs to subscribe to
  - Format: `?resourceIds=template-123,query-456`
  - Examples: execution IDs, template IDs, query IDs, cell IDs

**Authentication:**
- Session cookie required (`session` cookie)
- Anonymous connections not allowed

**Response:**
- Content-Type: `text/event-stream`
- Transfer-Encoding: `chunked`
- Connection: `keep-alive`

**Message Format (Server-Sent Events):**
```
data: {"type":"connect","sessionId":"uuid","timestamp":1234567890,"data":{...}}

data: {"type":"execution:start","id":"exec-123","timestamp":1234567890,"status":"running","data":{...}}

data: {"type":"execution:step_start","id":"exec-123","timestamp":1234567890,"data":{"stepId":"step-1",...}}

data: {"type":"heartbeat","sessionId":"uuid","timestamp":1234567891}
```

**Rate Limit:** 20 connections/hour

**Timeout:** Connection closed after 30 seconds of inactivity

## Message Protocol Details

### Execution Start Message
```json
{
    "type": "execution:start",
    "id": "execution-uuid-123",
    "sessionId": "session-uuid",
    "timestamp": 1705339200000,
    "data": {
        "executionType": "template",
        "templateId": "tmpl-456",
        "userId": "user-789"
    },
    "status": "running"
}
```

### Step Progress Message
```json
{
    "type": "execution:step_complete",
    "id": "execution-uuid-123",
    "timestamp": 1705339205000,
    "data": {
        "stepId": "step-1",
        "duration": 5000,
        "output": {
            "rowsAffected": 1000,
            "columns": ["id", "name", "email"]
        }
    },
    "status": "completed"
}
```

### Query Result Streaming
```json
{
    "type": "query:result",
    "id": "query-uuid-456",
    "timestamp": 1705339203000,
    "data": {
        "rows": [
            {"id": 1, "name": "Alice", "score": 95},
            {"id": 2, "name": "Bob", "score": 87}
        ],
        "totalRows": 10000,
        "offset": 0
    },
    "progress": 2
}
```

### Cell Output
```json
{
    "type": "cell:output",
    "id": "cell-uuid-789",
    "timestamp": 1705339202000,
    "data": {
        "outputType": "stdout",
        "content": "Processing 1000 records...",
        "mimeType": "text/plain"
    }
}
```

### Error Message
```json
{
    "type": "execution:error",
    "id": "execution-uuid-123",
    "timestamp": 1705339210000,
    "error": "Memory limit exceeded during transformation",
    "data": {
        "duration": 10000
    },
    "status": "failed"
}
```

## Features

### 1. Automatic Reconnection
- Exponential backoff (3s → 4.5s → 6.75s, etc.)
- Max 10 reconnection attempts
- Manual reconnect available via hook

### 2. Heartbeat
- Sent every 30 seconds
- Detects dead connections
- Server timeout after 30 seconds of inactivity

### 3. Subscription Management
- Subscribe to multiple resources
- Dynamic subscription updates
- Per-resource message routing

### 4. Session Isolation
- Each connection tied to user session
- Messages only delivered to subscribed connections
- User ID validation on all connections

### 5. Rate Limiting
- 20 new connections/hour per IP
- Prevents resource exhaustion
- Returns 429 (Too Many Requests) when exceeded

## Best Practices

### 1. Resource Cleanup
```typescript
useEffect(() => {
    return () => {
        // Automatic cleanup when component unmounts
    };
}, []);
```

### 2. Error Handling
```typescript
const { error } = useRealtime({
    resourceIds: ['exec-123'],
    onError: (error) => {
        logError('Realtime connection failed', error);
        showUserNotification('Live updates temporarily unavailable');
    },
});
```

### 3. Performance Optimization
```typescript
// Only subscribe to resources you need
const { connected } = useRealtime({
    resourceIds: activeExecutionIds, // Dynamic
    onMessage: (msg) => {
        // Filter unnecessary messages
        if (msg.type !== WebSocketMessageType.HEARTBEAT) {
            handleMessage(msg);
        }
    },
});
```

### 4. Graceful Degradation
```typescript
if (!connected) {
    // Fallback to polling
    useEffect(() => {
        const poll = setInterval(
            () => fetchExecutionStatus(),
            2000
        );
        return () => clearInterval(poll);
    }, []);
}
```

## Monitoring & Debugging

### Get Connection Stats
```typescript
import websocketService from '@/src/services/websocketService';

const stats = websocketService.getStats();
console.log(`
    Active connections: ${stats.activeConnections}
    Total subscriptions: ${stats.totalSubscriptions}
    Active resources: ${stats.activeResources}
`);
```

### Server-Side Debugging
```typescript
websocketService.on('connection:registered', (event) => {
    console.log(`New connection: ${event.sessionId}`);
});

websocketService.on('subscription:added', (event) => {
    console.log(`New subscription: ${event.sessionId} -> ${event.resourceId}`);
});

websocketService.on('connection:timeout', (event) => {
    console.log(`Connection timeout: ${event.sessionId}`);
});
```

## UI Components

The system includes ready-to-use React components:

### ExecutionMonitor
Displays real-time execution progress with status, progress bar, current step, and output preview.

```typescript
<ExecutionMonitor
    executionId="exec-123"
    onComplete={(output) => console.log('Done:', output)}
    onError={(error) => console.error('Failed:', error)}
/>
```

### ExecutionStepsTracker
Shows detailed step-by-step execution status with timing and errors.

```typescript
<ExecutionStepsTracker executionId="exec-123" />
```

### LiveQueryResults
Streams query results in real-time with pagination.

```typescript
<LiveQueryResults queryId="query-456" maxRows={100} />
```

## Limitations

- **Max concurrent connections:** 1000 per server
- **Max message size:** 1 MB per message
- **Connection timeout:** 30 seconds of inactivity
- **Max subscriptions per connection:** 50
- **Message history:** Not persisted (SSE is stream-only)

## Migration from REST Polling

**Before (polling every 2 seconds):**
```typescript
useEffect(() => {
    const poll = setInterval(async () => {
        const res = await fetch(`/api/executions/${id}`);
        setExecution(await res.json());
    }, 2000);
    return () => clearInterval(poll);
}, [id]);
```

**After (real-time updates):**
```typescript
const { progress, status, output } = useExecutionProgress(id);
```

Benefits:
- ✅ Reduced server load (70% fewer requests)
- ✅ Instant updates (vs 2s delay)
- ✅ Automatic reconnection
- ✅ Memory efficient
- ✅ Cleaner code

---

For more information on templates, connectors, or notebooks, refer to their respective documentation files.
