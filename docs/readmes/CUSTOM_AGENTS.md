# Custom Agents Framework - Phase 3.4

## Overview

The Custom Agents Framework enables autonomous AI agents to execute complex tasks with tool access, persistent memory, and multi-step reasoning. Agents can leverage the LLM abstraction layer (Phase 3.1), workspace isolation (Phase 3.2), and RBAC permissions (Phase 3.3) to operate safely within defined boundaries.

### Key Features

- **Autonomous Execution**: Multi-step reasoning with goal-oriented behavior
- **Tool Integration**: Pre-built tools (web search, code execution, database queries, file operations, email, HTTP) plus custom webhook tools
- **Memory System**: Conversation history, observations, facts, and summaries with importance scoring
- **Execution Tracking**: Full audit trail of steps, decisions, and tool calls
- **Multi-Model Support**: Agents can use any LLM provider (Gemini, OpenAI, Claude, BYOM)
- **Workspace Isolation**: Agents operate within workspace boundaries with proper access control
- **RBAC Integration**: Permission checks for agent creation, execution, and resource access

### Architecture

```
User Request
    ↓
AgentService.startExecution()
    ↓
AgentExecutor.execute()
    ├─ Agent Thinks (LLM)
    │   └─ Determine next action
    │
    ├─ If action == tool_call
    │   ├─ ToolRegistry.executeTool()
    │   ├─ Tool Execution (builtin/custom/webhook)
    │   └─ Add observation to memory
    │
    ├─ If action == response
    │   ├─ Return final answer
    │   └─ Add to conversation memory
    │
    └─ Continue until goal achieved or max steps reached
```

## Database Schema

### agents Table
Defines AI agents with capabilities and configuration.

```sql
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE (workspace_id, slug),
    description TEXT,
    
    -- Agent type and configuration
    type TEXT NOT NULL DEFAULT 'assistant', -- 'assistant' | 'analyst' | 'researcher' | 'custom'
    llm_model_id UUID REFERENCES llm_models(id),
    system_prompt TEXT,
    temperature DECIMAL(3,2),
    max_tokens DECIMAL(10,0),
    
    -- Capabilities
    available_tools JSONB, -- ['web_search', 'code_executor', 'database_query']
    can_use_browser BOOLEAN DEFAULT false,
    can_execute_code BOOLEAN DEFAULT false,
    can_access_database BOOLEAN DEFAULT false,
    can_create_resources BOOLEAN DEFAULT false,
    
    -- Execution configuration
    max_steps DECIMAL(5,0) DEFAULT 20,
    timeout DECIMAL(10,0) DEFAULT 300000, -- 5 minutes in ms
    allow_user_interaction BOOLEAN DEFAULT false,
    memory_strategy TEXT DEFAULT 'conversation', -- 'conversation' | 'summary' | 'hierarchical'
    memory_size DECIMAL(10,0) DEFAULT 100,
    
    -- Status and metadata
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_public BOOLEAN NOT NULL DEFAULT false,
    tags JSONB,
    metadata JSONB,
    version DECIMAL(5,0) DEFAULT 1,
    
    -- Audit
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX agents_workspace_id_idx ON agents(workspace_id);
CREATE UNIQUE INDEX agents_slug_idx ON agents(workspace_id, slug);
CREATE INDEX agents_type_idx ON agents(type);
CREATE INDEX agents_is_active_idx ON agents(is_active);
```

**Key Fields**:
- **type**: Predefined agent categories or custom
- **system_prompt**: Custom instructions for agent behavior
- **available_tools**: Array of tool codes agent can use
- **timeout**: Session timeout in milliseconds
- **memory_strategy**: How to handle conversation history
  - `conversation`: Keep most recent messages
  - `summary`: Summarize old conversations
  - `hierarchical`: Topic-based organization

### tools Table
Registry of tools available to agents.

```sql
CREATE TABLE tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    
    -- Identity
    code TEXT NOT NULL UNIQUE (workspace_id, code),
    name TEXT NOT NULL,
    description TEXT,
    
    -- Type and category
    type TEXT NOT NULL, -- 'builtin' | 'custom' | 'webhook'
    category TEXT NOT NULL, -- 'search' | 'execution' | 'data' | 'integration'
    
    -- Tool definition
    input_schema JSONB NOT NULL, -- JSON schema for parameters
    output_schema JSONB, -- JSON schema for output
    
    -- Execution
    handler TEXT, -- Handler function or identifier
    webhook_url TEXT,
    webhook_secret TEXT,
    
    -- Configuration
    requires_approval BOOLEAN DEFAULT false,
    rate_limit DECIMAL(10,0), -- Calls per hour
    timeout DECIMAL(10,0) DEFAULT 30000,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_public BOOLEAN NOT NULL DEFAULT false,
    version TEXT DEFAULT '1.0.0',
    metadata JSONB,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX tools_workspace_id_idx ON tools(workspace_id);
CREATE INDEX tools_type_idx ON tools(type);
CREATE INDEX tools_category_idx ON tools(category);
```

**Tool Types**:
- **builtin**: Pre-implemented tools (web_search, code_executor, etc.)
- **custom**: Workspace-specific implementations
- **webhook**: External service integration with HTTP callback

### agent_executions Table
Track agent runs and their results.

```sql
CREATE TABLE agent_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    agent_id UUID NOT NULL REFERENCES agents(id),
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Context
    status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'failed' | 'cancelled'
    goal TEXT NOT NULL,
    input JSONB,
    
    -- Tracking
    current_step DECIMAL(5,0) DEFAULT 0,
    total_steps DECIMAL(5,0) DEFAULT 0,
    tokens_used JSONB, -- {input: 123, output: 456}
    cost_usd DECIMAL(10,6),
    
    -- Results
    output JSONB,
    error TEXT,
    success_metrics JSONB,
    
    -- Timing
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    duration DECIMAL(10,0)
);
CREATE INDEX agent_executions_workspace_id_idx ON agent_executions(workspace_id);
CREATE INDEX agent_executions_agent_id_idx ON agent_executions(agent_id);
CREATE INDEX agent_executions_status_idx ON agent_executions(status);
```

**Status Values**:
- `running`: Execution in progress
- `success`: Completed successfully
- `failed`: Execution failed
- `cancelled`: User cancelled execution

### agent_steps Table
Individual steps within an execution.

```sql
CREATE TABLE agent_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES agent_executions(id),
    agent_id UUID NOT NULL REFERENCES agents(id),
    
    -- Tracking
    step_number DECIMAL(5,0) NOT NULL,
    action_type TEXT NOT NULL, -- 'think' | 'tool_call' | 'user_input' | 'response'
    status TEXT NOT NULL DEFAULT 'pending',
    
    -- Thinking
    thought TEXT,
    reasoning TEXT,
    
    -- Tool call
    tool_code TEXT,
    tool_input JSONB,
    tool_output JSONB,
    tool_error TEXT,
    
    -- Response
    message TEXT,
    is_conversation_end BOOLEAN DEFAULT false,
    
    -- Metadata
    tokens JSONB,
    duration DECIMAL(10,0), -- Milliseconds
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX agent_steps_execution_id_idx ON agent_steps(execution_id);
CREATE INDEX agent_steps_action_type_idx ON agent_steps(action_type);
```

**Action Types**:
- `think`: Agent reasoning step
- `tool_call`: Tool execution step
- `user_input`: Waiting for user input
- `response`: Final response to user

### agent_memory Table
Persistent memory for agent conversations.

```sql
CREATE TABLE agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    conversation_id UUID NOT NULL REFERENCES agent_conversations(id),
    
    -- Content
    type TEXT NOT NULL, -- 'message' | 'observation' | 'fact' | 'summary'
    role TEXT, -- 'user' | 'assistant'
    content TEXT NOT NULL,
    
    -- Metadata
    importance DECIMAL(3,2) DEFAULT 0.5, -- 0-1 score
    embedding TEXT, -- Vector for semantic search
    tags JSONB,
    
    -- Retention
    expires_at TIMESTAMP,
    is_short_term BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX agent_memory_agent_id_idx ON agent_memory(agent_id);
CREATE INDEX agent_memory_conversation_id_idx ON agent_memory(conversation_id);
CREATE INDEX agent_memory_type_idx ON agent_memory(type);
CREATE INDEX agent_memory_importance_idx ON agent_memory(importance);
```

**Memory Types**:
- `message`: Conversation message (user or assistant)
- `observation`: Tool output or observation
- `fact`: Important facts learned
- `summary`: Summary of previous sections

### agent_conversations Table
Track conversations between users and agents.

```sql
CREATE TABLE agent_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    agent_id UUID NOT NULL REFERENCES agents(id),
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Metadata
    title TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'archived' | 'closed'
    
    -- Tracking
    message_count DECIMAL(10,0) DEFAULT 0,
    execution_count DECIMAL(10,0) DEFAULT 0,
    total_tokens JSONB,
    
    -- Context
    context JSONB,
    metadata JSONB,
    
    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMP
);
CREATE INDEX agent_conversations_workspace_id_idx ON agent_conversations(workspace_id);
CREATE INDEX agent_conversations_agent_id_idx ON agent_conversations(agent_id);
CREATE INDEX agent_conversations_status_idx ON agent_conversations(status);
```

### tool_execution_log Table
Audit trail for all tool executions.

```sql
CREATE TABLE tool_execution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    tool_id UUID NOT NULL REFERENCES tools(id),
    execution_id UUID NOT NULL REFERENCES agent_executions(id),
    
    -- Execution details
    status TEXT NOT NULL, -- 'pending' | 'success' | 'error' | 'timeout'
    input JSONB NOT NULL,
    output JSONB,
    error TEXT,
    
    -- Performance
    duration DECIMAL(10,0) NOT NULL,
    retries DECIMAL(5,0) DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP
);
CREATE INDEX tool_execution_log_workspace_id_idx ON tool_execution_log(workspace_id);
CREATE INDEX tool_execution_log_tool_id_idx ON tool_execution_log(tool_id);
CREATE INDEX tool_execution_log_execution_id_idx ON tool_execution_log(execution_id);
```

## Builtin Tools

### web_search
Search the internet for information.

**Input Schema**:
```json
{
    "query": {
        "type": "string",
        "description": "Search query"
    },
    "maxResults": {
        "type": "number",
        "description": "Maximum number of results",
        "default": 10
    }
}
```

**Output**:
```json
{
    "results": [
        {
            "title": "Result Title",
            "url": "https://example.com",
            "snippet": "Result preview text..."
        }
    ]
}
```

### code_executor
Execute Python or JavaScript code in isolated environment.

**Input Schema**:
```json
{
    "language": {
        "type": "string",
        "enum": ["python", "javascript"]
    },
    "code": {
        "type": "string",
        "description": "Code to execute"
    },
    "timeout": {
        "type": "number",
        "default": 30000
    }
}
```

**Output**:
```json
{
    "output": "Code output text",
    "error": "Error message if failed"
}
```

### database_query
Execute SQL queries and retrieve data.

**Input Schema**:
```json
{
    "query": {
        "type": "string",
        "description": "SQL query"
    },
    "limit": {
        "type": "number",
        "default": 100
    }
}
```

**Output**:
```json
{
    "rows": [...],
    "count": 10
}
```

### file_operations
Read, write, and manage files.

**Input Schema**:
```json
{
    "operation": {
        "type": "string",
        "enum": ["read", "write", "delete", "list"]
    },
    "path": {
        "type": "string"
    },
    "content": {
        "type": "string",
        "description": "For write operations"
    }
}
```

### email_sender
Send emails to workspace users.

**Input Schema**:
```json
{
    "to": {
        "type": "string",
        "description": "Email address"
    },
    "subject": {
        "type": "string"
    },
    "body": {
        "type": "string"
    },
    "htmlBody": {
        "type": "string",
        "description": "Optional HTML version"
    }
}
```

### http_request
Make HTTP requests to external APIs.

**Input Schema**:
```json
{
    "method": {
        "type": "string",
        "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"]
    },
    "url": {
        "type": "string"
    },
    "headers": {
        "type": "object"
    },
    "body": {
        "type": "object"
    }
}
```

## API Endpoints

### Agent Management

#### List Agents
```http
GET /api/agents?workspaceId=ws-123
```

**Response**:
```json
{
    "agents": [
        {
            "id": "agent-1",
            "workspaceId": "ws-123",
            "name": "Research Assistant",
            "type": "researcher",
            "isActive": true,
            "createdAt": "2024-01-15T10:00:00Z"
        }
    ]
}
```

#### Create Agent
```http
POST /api/agents
Content-Type: application/json

{
    "workspaceId": "ws-123",
    "name": "Research Assistant",
    "description": "Performs research using web search and analysis",
    "type": "researcher",
    "systemPrompt": "You are a research assistant...",
    "maxSteps": 20,
    "temperature": 0.7,
    "maxTokens": 4000,
    "tags": ["research", "analysis"]
}
```

**Response** (201):
```json
{
    "agent": {
        "id": "agent-1",
        "workspaceId": "ws-123",
        "name": "Research Assistant",
        "slug": "research-assistant",
        "type": "researcher",
        "isActive": true,
        "createdAt": "2024-01-15T10:00:00Z"
    }
}
```

**Permissions Required**:
- `agents:create` on workspace

#### Get Agent Details
```http
GET /api/agents/agent-1?workspaceId=ws-123
```

**Response**:
```json
{
    "agent": { ... },
    "stats": {
        "totalExecutions": 45,
        "successfulExecutions": 42,
        "failedExecutions": 3,
        "successRate": 93.3,
        "totalTokens": 125000,
        "totalConversations": 15,
        "totalMessages": 87
    }
}
```

### Agent Execution

#### Start Execution
```http
POST /api/agents/agent-1/execute
Content-Type: application/json

{
    "workspaceId": "ws-123",
    "goal": "Research the latest developments in AI",
    "input": {
        "topic": "artificial intelligence",
        "depth": "detailed"
    },
    "context": {
        "userPreferences": { ... }
    }
}
```

**Response** (202):
```json
{
    "executionId": "exec-1",
    "conversationId": "conv-1",
    "status": "running"
}
```

**Permissions Required**:
- `agents:execute` on workspace

#### Get Execution History
```http
GET /api/agents/agent-1/executions?workspaceId=ws-123&limit=50
```

**Response**:
```json
{
    "executions": [
        {
            "id": "exec-1",
            "status": "success",
            "goal": "Research AI developments",
            "tokensUsed": { "input": 1000, "output": 500 },
            "startedAt": "2024-01-15T10:00:00Z",
            "completedAt": "2024-01-15T10:05:00Z",
            "duration": 300000
        }
    ]
}
```

#### Get Execution Details
```http
GET /api/agents/agent-1/executions/exec-1?workspaceId=ws-123
```

**Response**:
```json
{
    "steps": [
        {
            "stepNumber": 1,
            "actionType": "think",
            "thought": "I should search for recent AI developments..."
        },
        {
            "stepNumber": 2,
            "actionType": "tool_call",
            "toolCode": "web_search",
            "toolInput": { "query": "latest AI developments 2024" },
            "toolOutput": {
                "results": [...]
            }
        },
        {
            "stepNumber": 3,
            "actionType": "response",
            "message": "Based on my research, here are the latest developments..."
        }
    ]
}
```

### Conversations

#### Send Message to Agent
```http
POST /api/agents/conversations/conv-1/message
Content-Type: application/json

{
    "workspaceId": "ws-123",
    "agentId": "agent-1",
    "message": "What are the latest AI trends?"
}
```

**Response** (202):
```json
{
    "executionId": "exec-2",
    "conversationId": "conv-1",
    "status": "running"
}
```

**Permissions Required**:
- `agents:execute` on workspace

### Tools

#### List Available Tools
```http
GET /api/agents/tools?workspaceId=ws-123
```

**Response**:
```json
{
    "tools": {
        "builtin": [
            {
                "code": "web_search",
                "name": "Web Search",
                "description": "Search the internet for information",
                "category": "search",
                "type": "builtin",
                "inputSchema": { ... }
            },
            {
                "code": "code_executor",
                "name": "Code Executor",
                "description": "Execute Python or JavaScript code",
                "category": "execution",
                "type": "builtin"
            }
        ],
        "custom": [
            {
                code": "custom_data_fetcher",
                "name": "Custom Data Fetcher",
                "description": "Fetch data from internal API",
                "category": "integration",
                "type": "webhook"
            }
        ]
    }
}
```

## Service Usage

### Create and Execute Agent

```typescript
import { AgentService, AgentExecutor } from '@/src/services/agentService';

// Create agent
const agent = await AgentService.createAgent({
    workspaceId: 'ws-123',
    name: 'Research Assistant',
    type: 'researcher',
    systemPrompt: 'You are a helpful research assistant...',
    createdBy: 'user-123',
});

// Start execution
const { executionId, conversationId } = await AgentService.startExecution({
    workspaceId: 'ws-123',
    agentId: agent.id,
    userId: 'user-123',
    goal: 'Research recent AI trends',
});

// Execute agent (async)
const executor = new AgentExecutor(
    executionId,
    agent.id,
    'ws-123',
    'user-123',
    conversationId,
    20 // max steps
);

const result = await executor.execute('Research recent AI trends');
console.log(result);
// { success: true, output: "..." }

// Complete execution
await AgentService.completeExecution(
    executionId,
    result.success ? 'success' : 'failed',
    result.output,
    result.error
);
```

### Manage Conversation Memory

```typescript
// Add user message
await AgentService.addMemory(
    agentId,
    workspaceId,
    conversationId,
    {
        type: 'message',
        role: 'user',
        content: 'What is machine learning?',
        importance: 0.9,
    }
);

// Add observation from tool
await AgentService.addMemory(
    agentId,
    workspaceId,
    conversationId,
    {
        type: 'observation',
        content: 'Found 50 relevant Wikipedia articles about ML',
        importance: 0.7,
    }
);

// Get conversation memory
const memory = await AgentService.getConversationMemory(conversationId, 50);
console.log(memory);
```

### Check Agent Statistics

```typescript
const stats = await AgentService.getAgentStats('ws-123', 'agent-1');
console.log(stats);
// {
//   totalExecutions: 45,
//   successfulExecutions: 42,
//   failedExecutions: 3,
//   successRate: 93.3,
//   totalTokens: 125000,
//   totalConversations: 15,
//   totalMessages: 87
// }
```

## Security & Permissions

### Permission Matrix

| Action | Role | Effect |
|--------|------|--------|
| Create Agent | Admin | Create new agents with specific capabilities |
| Edit Agent | Admin | Modify agent configuration and tools |
| Execute Agent | Editor+ | Run agent executions |
| View History | Viewer+ | See execution history and results |
| Delete Agent | Admin | Deactivate agent |

### Permission Categories

- `agents:create`: Create new agents
- `agents:edit`: Modify agent configuration
- `agents:execute`: Run agent executions
- `agents:view`: View agent details and history
- `agents:delete`: Deactivate agents
- `tools:create`: Create custom tools
- `tools:manage`: Manage tool access

### Tool Execution Safety

1. **Input Validation**: All tool inputs validated against JSON schema
2. **Timeout Enforcement**: Tools time out after configured duration (default 30s)
3. **Rate Limiting**: Tools subject to workspace rate limits
4. **Approval Gates**: Tools can require approval before execution
5. **Audit Logging**: All tool executions logged with inputs/outputs
6. **Isolation**: Code execution runs in isolated containers
7. **Resource Limits**: Memory and CPU constraints on executions

## Best Practices

### Agent Design

1. **Clear System Prompts**: Define agent role and constraints
2. **Appropriate Tool Selection**: Give agents only necessary tools
3. **Step Limits**: Set reasonable max_steps (20-50 typical)
4. **Memory Strategy**: Choose based on conversation type
   - `conversation`: Most natural, default
   - `summary`: Better for long-running agents
   - `hierarchical`: Complex, topic-specific conversations

### Execution Patterns

```typescript
// Good: Clear goal with context
await AgentService.startExecution({
    goal: 'Analyze Q4 sales data for product category',
    input: {
        category: 'software',
        quarter: 'Q4-2024',
    },
    context: {
        userRole: 'analyst',
        department: 'sales',
    },
});

// Avoid: Vague goals
await AgentService.startExecution({
    goal: 'Do some analysis',
    input: {},
});
```

### Memory Management

1. **Mark Important Data**: Set `importance: 0.8+` for critical facts
2. **Use Expiration**: Set `expiresAt` for temporary data
3. **Monitor Memory Size**: Control memory growth with `memory_size` setting
4. **Leverage Tags**: Use tags for semantic organization

### Tool Integration

1. **Validate Outputs**: Tools should return consistent schemas
2. **Error Handling**: Tools should provide meaningful error messages
3. **Timeout Consideration**: Set appropriate timeouts for tool type
4. **Rate Limiting**: Monitor tool execution frequency

## Roadmap

### Phase 3.4.1: Advanced Reasoning
- [ ] Chain-of-thought prompting
- [ ] Reflection mechanism
- [ ] Self-correction loops
- [ ] Uncertainty quantification

### Phase 3.4.2: Multi-Agent Coordination
- [ ] Agent-to-agent communication
- [ ] Shared task queues
- [ ] Hierarchical agent orchestration
- [ ] Collaborative goal solving

### Phase 3.4.3: Advanced Memory
- [ ] Vector embeddings for similarity search
- [ ] Compression and summarization
- [ ] Long-term persistent memory
- [ ] Cross-conversation learning

### Phase 3.4.4: Tool Ecosystem
- [ ] Tool marketplace
- [ ] Custom tool builder UI
- [ ] Tool versioning and rollback
- [ ] Tool performance analytics

### Phase 3.4.5: Agent Customization
- [ ] Agent training/fine-tuning UI
- [ ] Custom behavior rules
- [ ] Agent personality profiles
- [ ] Domain-specific agent templates
