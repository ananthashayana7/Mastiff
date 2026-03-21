# Notebook System Documentation

## Overview

The Notebook system provides a Jupyter-like interface for writing, executing, and visualizing Python code and analysis within Mastiff. It includes features for:

- **Cell-based code execution** - Write code in cells and execute them individually
- **Rich output display** - Results, errors, and visualizations display inline
- **Execution history** - Track all executions with timing and resource usage
- **Variable state** - Maintain global variables across cell executions
- **Persistent storage** - Notebooks and execution history stored in database

## Architecture

### Database Schema

#### Tables

**notebooks** - Main notebook metadata
```sql
- id (UUID, PK)
- user_id (UUID, FK → users)
- session_id (UUID, FK → sessions)
- title (VARCHAR)
- description (TEXT)
- cells (JSONB)
- last_executed_at (TIMESTAMP)
- execution_count (INT)
- tags (TEXT)
- is_public (BOOLEAN)
- created_at, updated_at
```

**notebook_cells** - Individual cells with execution state
```sql
- id (UUID, PK)
- notebook_id (UUID, FK → notebooks)
- cell_type (VARCHAR: 'code' | 'markdown')
- cell_index (INT)
- source (TEXT)
- execution_count (INT)
- outputs (JSONB)
- status (VARCHAR: 'idle' | 'running' | 'completed' | 'error')
- error_message (TEXT)
- execution_time_ms (INT)
- created_at, updated_at
```

**cell_execution_history** - Execution audit trail
```sql
- id (UUID, PK)
- cell_id (UUID, FK → notebook_cells)
- code (TEXT)
- output (JSONB)
- status (VARCHAR: 'success' | 'error' | 'timeout')
- error (TEXT)
- execution_time_ms (INT)
- memory_used_mb (INT)
- cpu_time_ms (INT)
- created_at
```

**notebook_variables** - Global notebook variables
```sql
- id (UUID, PK)
- notebook_id (UUID, FK → notebooks)
- var_name (VARCHAR)
- var_type (VARCHAR)
- var_value (JSONB)
- created_at, updated_at
```

### Services

#### NotebookService

Handles all notebook operations:

```typescript
// Create notebook
await NotebookService.createNotebook(userId, sessionId, notebook);

// Get notebook
const notebook = await NotebookService.getNotebook(notebookId, userId);

// List notebooks
const notebooks = await NotebookService.listNotebooks(userId, limit, offset);

// Update notebook
await NotebookService.updateNotebook(notebookId, userId, updates);

// Delete notebook
await NotebookService.deleteNotebook(notebookId, userId);

// Execute cell
const result = await NotebookService.executeCell(
    notebookId,
    cellId,
    userId,
    code,
    variables
);

// Get execution history
const history = await NotebookService.getCellHistory(cellId, limit);

// Manage variables
await NotebookService.setVariable(notebookId, varName, value, type);
const variables = await NotebookService.getVariables(notebookId);
```

### API Routes

#### `/api/notebooks` (POST, GET)
- **POST** - Create new notebook
- **GET** - List notebooks for current user

Request (POST):
```json
{
    "title": "My Analysis",
    "description": "Optional description",
    "cells": [
        {
            "cellType": "code",
            "cellIndex": 0,
            "source": "import pandas as pd\n..."
        }
    ],
    "tags": "analysis,data",
    "isPublic": false
}
```

Response:
```json
{
    "success": true,
    "notebookId": "uuid"
}
```

#### `/api/notebooks/[id]` (GET, PUT, DELETE)
- **GET** - Get notebook by ID
- **PUT** - Update notebook
- **DELETE** - Delete notebook

Request (PUT):
```json
{
    "title": "Updated Title",
    "description": "Updated description",
    "cells": [...],
    "tags": "updated,tags"
}
```

#### `/api/notebooks/[id]/execute` (POST, GET)
- **POST** - Execute a cell
- **GET** - Get cell execution history

Request (POST):
```json
{
    "cellId": "uuid",
    "code": "print('Hello World')",
    "variables": {
        "data": [1, 2, 3]
    }
}
```

Response:
```json
{
    "success": true,
    "result": {
        "status": "success",
        "output": "Hello World",
        "executionTimeMs": 145,
        "memoryUsedMb": 32
    }
}
```

### React Components

#### Notebook Component

Main notebook UI component.

```typescript
<Notebook
    notebookId="uuid"
    initialCells={cells}
    readOnly={false}
    onSave={async (cells) => { /* save notebook */ }}
    onExecute={async (cellId, code) => { /* execute cell */ }}
/>
```

Features:
- Cell editor with syntax highlighting
- Code and markdown cell types
- Real-time output display
- Error display with stack traces
- Execution counters and timing
- Variable state management
- Add/delete cell operations
- Auto-save every 30 seconds

## Usage Examples

### Create and Execute a Notebook

```typescript
// Create notebook
const response = await fetch('/api/notebooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        title: 'Data Analysis',
        cells: [
            {
                cellType: 'code',
                cellIndex: 0,
                source: 'import pandas as pd\ndf = pd.read_csv("data.csv")'
            }
        ]
    })
});

const { notebookId } = await response.json();

// Execute a cell
const execResponse = await fetch(`/api/notebooks/${notebookId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        cellId: 'cell-id',
        code: 'print(df.head())'
    })
});

const { result } = await execResponse.json();
console.log(result.output);
```

### List Notebooks

```typescript
const response = await fetch('/api/notebooks?limit=10&offset=0');
const { notebooks } = await response.json();

notebooks.forEach(nb => {
    console.log(`${nb.title} - ${nb.executionCount} executions`);
});
```

## Security Considerations

1. **Code Execution Sandboxing** - All code executes in Docker containers with resource limits:
   - Memory: 512MB max
   - CPU: 1 core
   - Timeout: 30 seconds

2. **User Authorization** - All operations validate user ownership via session
   - Can only access own notebooks
   - Can only execute own cells
   - Can only view own history

3. **Rate Limiting** - Execution endpoints have strict rate limits:
   - Cell execution: 50 per hour per user
   - History queries: 200 per hour
   - Notebook updates: 100 per hour

4. **Input Validation** - All inputs validated with Zod schemas
   - Prevents injection attacks
   - Prevents malformed data storage

5. **Audit Logging** - All operations logged:
   - Notebook creation/updates/deletes
   - Cell executions
   - Execution results
   - Errors and timeouts

## Performance Optimization

1. **Query Caching** - Recent results cached in memory
2. **Cell History Pagination** - Load execution history in batches
3. **Database Indexes** - Optimized indexes on frequently queried fields:
   - user_id
   - notebook_id
   - cell_id
   - status
   - created_at

4. **Auto-save** - Saves every 30 seconds instead of on every keystroke

## Error Handling

Cell execution errors include:

- **Syntax Errors** - Python syntax issues
- **Runtime Errors** - Code execution exceptions
- **Timeout Errors** - Execution exceeds 30 seconds
- **Memory Errors** - Exceeds 512MB
- **Docker Errors** - Container issues

All errors include:
- Error message
- Stack trace (when available)
- Execution time
- Resource usage

## Limitations

1. **Execution Timeout** - 30 seconds maximum per cell
2. **Memory Limit** - 512MB maximum per execution
3. **No Persistence Between Cells** - Each cell has isolated environment except for variables
4. **Single Python Version** - Uses system Python (3.10+)
5. **No Package Installation** - Pre-installed packages only

## Future Enhancements

1. **Kernel Sessions** - Persistent kernel for stateful execution
2. **Package Installation** - Install packages dynamically
3. **Visualization Support** - Matplotlib, Plotly rendering
4. **Notebook Sharing** - Public notebooks and collaboration
5. **Git Integration** - Version control for notebooks
6. **Templates** - Pre-built notebook templates
7. **Scheduled Execution** - Run notebooks on schedule
8. **Email Reports** - Send notebook outputs via email

## Setup & Migration

To set up notebook tables in an existing database:

```typescript
import { migrateNotebookTables } from '@/src/lib/migrateNotebookTables';

await migrateNotebookTables();
```

This will create all required tables and indexes.
