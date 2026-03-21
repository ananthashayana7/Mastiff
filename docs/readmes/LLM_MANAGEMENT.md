# Multi-Model LLM Management System

## Overview

The LLM Management System enables Mastiff to support multiple AI language models from different providers, allowing users and workspaces to choose the best model for their use case. This system abstracts provider-specific details and provides a unified interface.

**Supported Providers**:
- 🔵 **Google Gemini** - Advanced multimodal AI
- 🟠 **OpenAI (GPT-4)** - Industry-leading language models
- 🟣 **Anthropic Claude** - Constitutional AI approach
- ⚙️ **Custom/BYOM** - Bring your own model (custom endpoints)

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────┐
│          Application Layer                      │
│   Chat, Analysis, Notebooks, Templates          │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────┐
│    LLM Management Service                       │
│   • Provider selection                          │
│   • User preferences                            │
│   • Cost tracking                               │
│   • Health monitoring                           │
└────────────────┬────────────────────────────────┘
                 │
     ┌───────────┼───────────┬──────────────┐
     │           │           │              │
┌────▼───┐  ┌───▼────┐  ┌──▼────┐  ┌─────▼─┐
│Gemini  │  │OpenAI  │  │Claude │  │Custom │
│Provider│  │Provider│  │Prov.  │  │Prov.  │
└────────┘  └────────┘  └───────┘  └───────┘
     │           │           │              │
     └───────────┼───────────┴──────────────┘
                 │
     ┌───────────┴──────────────┐
     │   LLM Provider Factory   │
     │  (Dynamic Instantiation) │
     └──────────────────────────┘
```

### Class Hierarchy

```typescript
abstract LLMProvider
  ├── GeminiProvider
  ├── OpenAIProvider
  ├── ClaudeProvider
  └── CustomProvider

LLMProviderFactory
  └── static create(config): LLMProvider

LLMManagementService
  ├── registerProvider()
  ├── getDefaultProvider()
  ├── getProviderForUser()
  ├── generateContent()
  ├── chat()
  ├── listModels()
  ├── setDefaultModel()
  └── setUserPreference()
```

## Database Schema

### Tables

#### `llm_models`
Primary table for storing LLM model configurations.

```sql
CREATE TABLE llm_models (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  
  -- Provider Info
  provider TEXT NOT NULL,           -- 'gemini' | 'openai' | 'anthropic' | 'custom'
  model TEXT NOT NULL,              -- Model identifier
  display_name TEXT NOT NULL,       -- User-friendly name
  description TEXT,
  
  -- Configuration
  api_key TEXT NOT NULL,            -- Encrypted in production
  custom_endpoint TEXT,             -- For BYOM
  temperature DECIMAL(3,2),         -- 0.0 - 2.0
  max_tokens DECIMAL(10,0),         -- Max output tokens
  
  -- Cost Tracking
  cost_per_input DECIMAL(10,8),     -- Per 1K tokens
  cost_per_output DECIMAL(10,8),    -- Per 1K tokens
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  
  metadata JSONB,                   -- Provider-specific data
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEXES: workspace_id, is_default, provider
);
```

#### `user_llm_preferences`
User-specific LLM model preferences.

```sql
CREATE TABLE user_llm_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  preferred_model_id UUID NOT NULL REFERENCES llm_models(id),
  
  temperature DECIMAL(3,2),         -- User override
  max_tokens DECIMAL(10,0),         -- User override
  
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEXES: user_id, workspace_id
);
```

#### `llm_usage`
Complete audit trail of all LLM API calls.

```sql
CREATE TABLE llm_usage (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  model_id UUID NOT NULL REFERENCES llm_models(id),
  
  -- Request Details
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  operation TEXT NOT NULL,          -- 'generateContent' | 'chat' | 'embedding'
  
  -- Token Usage
  input_tokens DECIMAL(10,0) NOT NULL,
  output_tokens DECIMAL(10,0) NOT NULL,
  total_tokens DECIMAL(10,0) NOT NULL,
  
  -- Cost
  cost_usd DECIMAL(10,6),
  
  -- Request/Response Info
  request_length DECIMAL(10,0),     -- Characters
  response_length DECIMAL(10,0),    -- Characters
  duration DECIMAL(10,0),           -- Milliseconds
  
  -- Status
  status TEXT NOT NULL,             -- 'success' | 'error' | 'partial'
  error_message TEXT,
  
  context JSONB,                    -- Debugging info
  source_action TEXT,               -- What triggered the call
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEXES: user_id, workspace_id, model_id, created_at
);
```

#### `llm_health`
Provider health status and monitoring.

```sql
CREATE TABLE llm_health (
  id UUID PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES llm_models(id),
  provider TEXT NOT NULL,
  
  -- Health Status
  is_healthy BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMP DEFAULT NOW(),
  last_failure_at TIMESTAMP,
  consecutive_failures DECIMAL(5,0) DEFAULT 0,
  
  -- Performance Metrics
  avg_response_time DECIMAL(10,2),  -- Milliseconds
  error_rate DECIMAL(5,2),          -- 0-100%
  uptime DECIMAL(5,2),              -- 0-100%
  
  -- Status Info
  status_message TEXT,
  last_error TEXT,
  
  -- Circuit Breaker
  retry_count DECIMAL(5,0) DEFAULT 0,
  is_circuit_breaker_open BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEXES: model_id, provider, is_healthy
);
```

## API Endpoints

### GET /api/llm/providers
List all supported LLM providers and their models.

**Response**:
```json
{
  "success": true,
  "providers": [
    {
      "name": "gemini",
      "displayName": "Google Gemini",
      "description": "Advanced multimodal AI model from Google",
      "models": ["gemini-2.0-flash", "gemini-pro", "gemini-pro-vision"]
    },
    {
      "name": "openai",
      "displayName": "OpenAI",
      "description": "GPT-4, GPT-3.5, and other OpenAI models",
      "models": ["gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"]
    },
    {
      "name": "anthropic",
      "displayName": "Anthropic Claude",
      "description": "Claude family of advanced AI models",
      "models": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"]
    }
  ],
  "count": 3
}
```

### GET /api/llm/models
List LLM models configured for a workspace.

**Query Parameters**:
- `workspaceId` (required): Workspace ID

**Response**:
```json
{
  "success": true,
  "models": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "provider": "openai",
      "model": "gpt-4-turbo",
      "displayName": "GPT-4 Turbo",
      "description": "Latest GPT-4 model",
      "isDefault": true,
      "isActive": true,
      "temperature": 0.7,
      "maxTokens": 4000,
      "costPerInput": 0.00003,
      "costPerOutput": 0.00006,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 1
}
```

### POST /api/llm/register
Register a new LLM model for the workspace.

**Request Body**:
```json
{
  "workspaceId": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "openai",
  "model": "gpt-4-turbo",
  "displayName": "GPT-4 Turbo",
  "apiKey": "sk-...",
  "temperature": 0.7,
  "maxTokens": 4000,
  "description": "Latest OpenAI model for complex analysis"
}
```

**Response**:
```json
{
  "success": true,
  "modelId": "550e8400-e29b-41d4-a716-446655440001",
  "message": "Registered openai model: GPT-4 Turbo"
}
```

### POST /api/llm/validate
Test connection to an LLM provider.

**Request Body**:
```json
{
  "provider": "openai",
  "model": "gpt-4-turbo",
  "apiKey": "sk-...",
  "customEndpoint": "https://api.openai.com/v1"
}
```

**Response**:
```json
{
  "success": true,
  "isValid": true,
  "message": "✓ Successfully connected to openai (gpt-4-turbo)"
}
```

### GET /api/llm/default
Get the default LLM model for a workspace.

**Query Parameters**:
- `workspaceId` (required): Workspace ID

**Response**:
```json
{
  "success": true,
  "model": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "openai",
    "model": "gpt-4-turbo",
    "displayName": "GPT-4 Turbo"
  }
}
```

### PUT /api/llm/default
Set the default LLM model for a workspace.

**Request Body**:
```json
{
  "workspaceId": "550e8400-e29b-41d4-a716-446655440000",
  "modelId": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Default model updated"
}
```

### POST /api/llm/preference
Set user's preferred LLM model.

**Request Body**:
```json
{
  "modelId": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Preference updated"
}
```

### DELETE /api/llm/models/:id
Deactivate/remove an LLM model.

**Response**:
```json
{
  "success": true,
  "message": "Model deactivated"
}
```

## Service Usage

### Basic Usage

```typescript
import llmManagement from '@/src/services/llmManagement';

// Get default provider for workspace
const provider = await llmManagement.getDefaultProvider(workspaceId);

const response = await provider.generateContent(
  'Analyze this data...',
  'You are a data scientist'
);

console.log(response.text);      // Generated content
console.log(response.tokens);    // {input: 125, output: 340}
console.log(response.provider);  // 'openai'
```

### Generate Content

```typescript
const response = await llmManagement.generateContent(
  'Analyze the sales trends',
  workspaceId,
  userId,
  {
    systemInstruction: 'You are a data analyst',
    modelId: 'specific-model-id', // Optional: use specific model
    temperature: 0.5,
  }
);
```

### Chat Interface

```typescript
const messages = [
  { role: 'user', content: 'What are the top 3 trends?' },
  { role: 'assistant', content: 'Based on the data...' },
  { role: 'user', content: 'Tell me more about trend #1' }
];

const response = await llmManagement.chat(
  messages,
  workspaceId,
  userId,
  {
    systemInstruction: 'You are an expert analyst',
    modelId: 'preferred-model-id'
  }
);
```

### Provider Management

```typescript
// List available providers
const providers = llmManagement.getSupportedProviders();

// Register new provider
const modelId = await llmManagement.registerProvider(
  workspaceId,
  userId,
  {
    provider: 'openai',
    model: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    apiKey: 'sk-...',
    temperature: 0.7
  }
);

// Set as default
await llmManagement.setDefaultModel(workspaceId, modelId);

// Set user preference
await llmManagement.setUserPreference(userId, modelId);

// Get models for workspace
const models = await llmManagement.listModels(workspaceId);
```

## Provider-Specific Configuration

### Google Gemini

```typescript
{
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  apiKey: process.env.GOOGLE_API_KEY,
  temperature: 0.7,
  maxTokens: 2048
}
```

**Features**:
- System instructions support
- JSON response formatting
- Optional token counting
- Vision/multimodal support (gemini-pro-vision)

### OpenAI (GPT-4)

```typescript
{
  provider: 'openai',
  model: 'gpt-4-turbo',
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.7,
  maxTokens: 4096
}
```

**Features**:
- Full token counting (input + output)
- Temperature control (0.0-2.0)
- Function calling
- Vision support

**Available Models**:
- `gpt-4-turbo` - Latest GPT-4
- `gpt-4` - Standard GPT-4
- `gpt-3.5-turbo` - Cost-effective

### Anthropic Claude

```typescript
{
  provider: 'anthropic',
  model: 'claude-3-opus',
  apiKey: process.env.ANTHROPIC_API_KEY,
  temperature: 0.7,
  maxTokens: 2048
}
```

**Features**:
- Constitutional AI alignment
- System prompt support
- Token counting
- Extended context windows

**Available Models**:
- `claude-3-opus` - Most capable
- `claude-3-sonnet` - Balanced
- `claude-3-haiku` - Fast & cheap

### Custom Endpoint (BYOM)

```typescript
{
  provider: 'custom',
  model: 'your-deployed-model',
  apiKey: 'your-api-key',
  apiEndpoint: 'https://your-model-endpoint.com/api',
  customHeaders: {
    'X-Custom-Header': 'value'
  }
}
```

**Use Cases**:
- Self-hosted models
- Fine-tuned models
- Proprietary LLM endpoints
- Custom API gateways

## Cost Tracking

The system automatically logs all LLM usage for cost tracking:

```typescript
// Get usage stats for a workspace
const usage = await db.query.llmUsage.findMany({
  where: eq(llmUsage.workspaceId, workspaceId),
  orderBy: desc(llmUsage.createdAt)
});

// Calculate costs
const totalCost = usage.reduce((sum, u) => parseFloat(u.costUSD || '0') + sum, 0);
const avgTokensPerRequest = usage.reduce((sum, u) => 
  parseInt(u.totalTokens as any) + sum, 0) / usage.length;
```

**Cost Calculation**:
```
Cost = (inputTokens / 1000 * costPerInput) + (outputTokens / 1000 * costPerOutput)
```

## Health Monitoring

The system includes health monitoring for each provider:

```typescript
// Get provider health
const health = await db.query.llmHealth.findFirst({
  where: eq(llmHealth.modelId, modelId)
});

// Check availability
if (health.isHealthy && !health.isCircuitBreakerOpen) {
  // Safe to use
}
```

**Health Metrics**:
- **Uptime**: Percentage of successful requests
- **Error Rate**: Percentage of failed requests
- **Avg Response Time**: Average latency in ms
- **Circuit Breaker**: Protection against cascading failures

## Error Handling

All LLM operations include comprehensive error handling:

```typescript
try {
  const response = await llmManagement.generateContent(
    prompt,
    workspaceId,
    userId
  );
} catch (error) {
  if (error instanceof LLMProviderError) {
    console.error('Provider error:', error.provider, error.message);
    // Fallback to another provider
  } else if (error instanceof ConnectionError) {
    console.error('Connection failed:', error.message);
    // Retry with exponential backoff
  }
}
```

## Security Best Practices

1. **API Key Storage**: Use environment variables or encrypted vault
   ```typescript
   const apiKey = process.env.OPENAI_API_KEY; // Never hardcode
   ```

2. **Input Validation**: Validate all user inputs
   ```typescript
   if (!systemInstruction || systemInstruction.length > 5000) {
      throw new Error('Invalid system instruction');
   }
   ```

3. **Rate Limiting**: Limit requests per user/workspace
   ```typescript
   await rateLimiter(request); // Applied to all endpoints
   ```

4. **Audit Logging**: Log all model changes
   ```typescript
   await auditLogger.log({
     userId,
     action: 'register_llm_provider',
     resourceId: modelId
   });
   ```

5. **Token Limits**: Enforce max tokens to prevent abuse
   ```typescript
   const maxTokens = Math.min(userMaxTokens, 4096);
   ```

## Performance Optimization

### Caching

```typescript
// Provider cache reduces instantiation overhead
llmManagement.providerCache.get(`default:${workspaceId}`);
```

### Lazy Loading

SDK packages are lazy-loaded only when needed:
```typescript
// Only loaded when Gemini provider is instantiated
const genai = dynamic(() => import('@google/genai'), { ssr: false });
```

### Connection Pooling

Reuse provider instances across requests:
```typescript
const provider = await llmManagement.getDefaultProvider(workspaceId);
// Single instance used for multiple requests
```

## Integration Examples

### Chat API Integration

```typescript
// src/app/api/chat/route.ts
import llmManagement from '@/src/services/llmManagement';

export async function POST(request: NextRequest) {
  const { messages, workspaceId, userId, modelId } = await request.json();

  const response = await llmManagement.chat(
    messages,
    workspaceId,
    userId,
    { modelId }
  );

  return NextResponse.json({
    message: response.text,
    tokens: response.tokens,
    provider: response.provider
  });
}
```

### Analysis Service Integration

```typescript
// src/services/executor.ts
import llmManagement from '@/src/services/llmManagement';

export async function analyzeData(
  data: any,
  workspaceId: string,
  userId: string
) {
  const systemPrompt = `You are a data analyst. Analyze the provided data and generate insights.`;

  const response = await llmManagement.generateContent(
    `Analyze this data: ${JSON.stringify(data)}`,
    workspaceId,
    userId,
    { systemInstruction: systemPrompt }
  );

  return response.text;
}
```

### Notebook System Integration

```typescript
// src/services/kernel.ts
import llmManagement from '@/src/services/llmManagement';

export class PythonKernel {
  async explainCode(code: string, workspaceId: string, userId: string) {
    return await llmManagement.generateContent(
      `Explain this Python code: ${code}`,
      workspaceId,
      userId,
      { systemInstruction: 'You are a Python expert' }
    );
  }
}
```

## Troubleshooting

### Invalid API Key
```
Error: Failed to validate openai connection
Solution: Verify API key format and permissions
- OpenAI: Starts with 'sk-'
- Gemini: Valid JSON key format
- Claude: Long alphanumeric string
```

### Rate Limiting
```
Error: Too many requests
Solution: 60 requests per minute per endpoint
- Implement request queuing
- Cache results when possible
- Use specific models instead of switching
```

### Model Not Found
```
Error: LLM model not found
Solution: Verify modelId exists and is active
- Check llm_models table
- Ensure workspace has registered models
```

### Connection Timeout
```
Error: Connection failed to provider
Solution: Check network and provider status
- Verify API endpoint accessibility
- Check rate limits on provider account
- Enable circuit breaker fallback
```

## Roadmap

**Phase 3.1** (Current):
- ✅ Multi-provider abstraction
- ✅ Database schema
- ✅ API endpoints
- ⏳ UI for provider management

**Phase 3.2+**:
- Vision/multimodal support
- Streaming responses
- Function calling
- Model fine-tuning
- Cost optimization
- Auto-failover strategies
- Provider comparison UI
