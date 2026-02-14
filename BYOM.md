# BYOM (Bring Your Own Model) - Phase 3.6

## Overview

The BYOM (Bring Your Own Model) system enables organizations to integrate custom, self-hosted, or proprietary LLM models alongside the built-in provider support (Phase 3.1). This allows enterprises to leverage:

- **Self-hosted models**: Run Llama, Mistral, Qwen, or other open-source models on private infrastructure
- **Proprietary models**: Integrate custom fine-tuned models developed in-house
- **API-based models**: Connect to external APIs or SaaS providers
- **Hybrid deployments**: Combine multiple model types and hosting approaches
- **Version management**: Track model versions, fine-tuning iterations, and rollouts
- **Fine-tuning support**: Manage LORA, QLoRA, or full fine-tuning experiments

### Key Features

- **Multi-hosting support**: Self-hosted, API, SaaS, or hybrid deployments
- **Flexible authentication**: API keys, bearer tokens, basic auth, OAuth2, mTLS
- **Health monitoring**: Automatic health checks with latency and resource tracking
- **Usage tracking**: Per-user token counts, costs, and performance metrics
- **Version control**: Track model versions, fine-tuning, and production rollouts
- **Access control**: Grant/revoke access at user, role, team, or workspace level
- **Performance analytics**: Uptime, throughput, latency measurements
- **Cost tracking**: Per-token pricing and usage-based billing support

### Architecture

```
User Request → Check BYOM Access Control
    ↓
Determine Model (primary or workspace-specific)
    ├─ If self-hosted: Direct endpoint call
    ├─ If API: HTTP request with auth
    └─ If SaaS: Redirect to provider
    
Process Response
    ├─ Count tokens (if supported)
    ├─ Measure response time
    ├─ Record health metrics
    └─ Log usage for billing

Store Usage Record
    ├─ Tokens used
    ├─ Cost calculated
    ├─ User/workspace attribution
    └─ Performance metrics
```

## Database Schema

### byom_models Table
Defines custom LLM models and their configuration.

```sql
CREATE TABLE byom_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    workspace_id UUID, -- NULL = org-wide
    
    -- Model Identity
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE (organization_id, slug),
    description TEXT,
    
    -- Model Type and Architecture
    type TEXT NOT NULL DEFAULT 'custom', -- 'custom' | 'llama' | 'mistral' | 'qwen' | 'proprietary'
    architecture TEXT, -- 'transformer' | 'moe'
    base_model TEXT, -- Original model (e.g., 'Llama-2-70B')
    finetuning_status TEXT DEFAULT 'base', -- 'base' | 'finetuned' | 'qlora' | 'lora'
    
    -- Hosting Information
    hosting_type TEXT NOT NULL, -- 'self-hosted' | 'api' | 'saas' | 'hybrid'
    endpoint_url TEXT NOT NULL, -- Base URL
    api_version TEXT,
    auth_method TEXT NOT NULL, -- 'api_key' | 'bearer_token' | 'basic_auth' | 'oauth2' | 'mtls'
    api_key TEXT, -- Encrypted
    tls_certificate TEXT, -- For mTLS
    
    -- Model Configuration
    max_tokens DECIMAL(10,0),
    context_window DECIMAL(10,0),
    temperature DECIMAL(3,2),
    top_p DECIMAL(3,2),
    
    -- Capabilities
    supports_streaming_completion BOOLEAN DEFAULT false,
    supports_token_counting BOOLEAN DEFAULT false,
    supports_embeddings BOOLEAN DEFAULT false,
    supports_image_input BOOLEAN DEFAULT false,
    supports_tool_calls BOOLEAN DEFAULT false,
    supports_function_calls BOOLEAN DEFAULT false,
    
    -- Performance Profile
    avg_latency_ms DECIMAL(10,2),
    throughput_tokens_per_second DECIMAL(10,2),
    cost_per_1k_tokens DECIMAL(10,6),
    
    -- Health & Monitoring
    is_available BOOLEAN NOT NULL DEFAULT true,
    last_health_check_at TIMESTAMP,
    health_check_interval_seconds DECIMAL(10,0) DEFAULT 300,
    uptime_percent DECIMAL(5,2),
    total_calls_processed DECIMAL(20,0) DEFAULT 0,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_primary BOOLEAN DEFAULT false,
    is_private BOOLEAN DEFAULT true,
    
    -- Configuration
    custom_headers JSONB,
    metadata JSONB,
    tags JSONB,
    security_policy JSONB,
    
    -- Audit
    created_by UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Key Fields**:
- **hosting_type**: Determines where model runs
  - `self-hosted`: On-premise infrastructure
  - `api`: External HTTP API
  - `saas`: SaaS provider (with redirect)
  - `hybrid`: Multiple hosting options
- **auth_method**: How to authenticate to endpoint
  - `api_key`: `Authorization: Bearer <key>`
  - `bearer_token`: `Authorization: Bearer <token>`
  - `basic_auth`: `Authorization: Basic <base64>`
  - `oauth2`: OAuth2 token exchange
  - `mtls`: Mutual TLS with certificate
- **capabilities**: Boolean flags for model features
- **cost_per_1k_tokens**: For billing calculations

### byom_health_checks Table
Track model health and availability.

```sql
CREATE TABLE byom_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES byom_models(id),
    organization_id UUID NOT NULL,
    
    -- Health Status
    status TEXT NOT NULL, -- 'healthy' | 'degraded' | 'unhealthy' | 'timeout'
    response_time_ms DECIMAL(10,2),
    status_code DECIMAL(5,0),
    
    -- Error Information
    error_code TEXT,
    error_message TEXT,
    
    -- Resource Usage
    tokens_per_second DECIMAL(10,2),
    memory_usage_percent DECIMAL(5,2),
    gpu_usage_percent DECIMAL(5,2),
    cpu_usage_percent DECIMAL(5,2),
    
    -- Metadata
    metadata JSONB,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### byom_usage Table
Track model usage and costs.

```sql
CREATE TABLE byom_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES byom_models(id),
    organization_id UUID NOT NULL,
    workspace_id UUID,
    user_id UUID NOT NULL,
    
    -- Request tracking
    request_id TEXT,
    
    -- Token counting
    input_tokens DECIMAL(20,0) NOT NULL,
    output_tokens DECIMAL(20,0) NOT NULL,
    total_tokens DECIMAL(20,0) NOT NULL,
    
    -- Timing and Cost
    response_time_ms DECIMAL(10,2),
    cost_usd DECIMAL(10,6),
    
    -- Metadata
    model_name TEXT,
    purpose TEXT, -- 'chat' | 'completion' | 'embedding' | 'analysis'
    metadata JSONB,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### byom_versions Table
Track model versions and fine-tuning iterations.

```sql
CREATE TABLE byom_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES byom_models(id),
    organization_id UUID NOT NULL,
    
    -- Version tracking
    version_number TEXT NOT NULL, -- 'v1.0', 'ft-v2'
    description TEXT,
    release_notes TEXT,
    
    -- Fine-tuning info
    finetuning_dataset_id UUID,
    finetune_parameters JSONB, -- {learningRate: 1e-4, epochs: 3}
    performance_metrics JSONB, -- {accuracy: 0.95, f1: 0.92}
    
    -- Artifact locations
    model_checkpoint_url TEXT,
    weights_url TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'training' | 'evaluating' | 'active' | 'deprecated'
    is_production BOOLEAN DEFAULT false,
    rollout_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Audit
    created_by UUID,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMP,
    deprecated_at TIMESTAMP
);
```

### byom_access_control Table
Control model access by user/role/team/workspace.

```sql
CREATE TABLE byom_access_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES byom_models(id),
    organization_id UUID NOT NULL,
    
    -- Subject of access
    subject_type TEXT NOT NULL, -- 'user' | 'role' | 'team' | 'workspace'
    subject_id UUID NOT NULL,
    
    -- Access level
    access_level TEXT NOT NULL DEFAULT 'use', -- 'view' | 'use' | 'manage' | 'admin'
    
    -- Constraints
    max_tokens_per_day DECIMAL(20,0),
    max_requests_per_day DECIMAL(10,0),
    expires_at TIMESTAMP,
    
    -- Audit
    granted_by UUID,
    granted_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## API Endpoints

### Model Management

#### List Models
```http
GET /api/byom/models?organizationId=org-123&workspaceId=ws-456&type=llama
```

**Response**:
```json
{
    "models": [
        {
            "id": "byom-1",
            "name": "Llama-2-70B-Local",
            "type": "llama",
            "hostingType": "self-hosted",
            "endpointUrl": "https://ml.internal.company.com:5000",
            "isAvailable": true,
            "uptimePercent": 99.95,
            "avgLatencyMs": 450,
            "supportsTokenCounting": true
        }
    ]
}
```

#### Register Model
```http
POST /api/byom/models
Content-Type: application/json

{
    "organizationId": "org-123",
    "name": "Llama-2-70B-Local",
    "description": "Production self-hosted Llama 2 70B",
    "type": "llama",
    "baseModel": "Llama-2-70B",
    "hostingType": "self-hosted",
    "endpointUrl": "https://ml.internal.company.com:5000",
    "apiVersion": "v1",
    "authMethod": "bearer_token",
    "apiKey": "sk-local-...",
    "maxTokens": 4096,
    "contextWindow": 4096,
    "temperature": 0.7,
    "supportsStreamingCompletion": true,
    "supportsTokenCounting": true,
    "costPer1kTokens": 0.000001,
    "healthCheckIntervalSeconds": 300,
    "tags": ["production", "local-only", "high-performance"]
}
```

**Response** (201):
```json
{
    "model": {
        "id": "byom-1",
        "organizationId": "org-123",
        "name": "Llama-2-70B-Local",
        "isActive": true,
        "createdAt": "2024-01-15T10:00:00Z"
    },
    "message": "Model registered successfully"
}
```

#### Get Model Details
```http
GET /api/byom/models/byom-1?organizationId=org-123
```

**Response**:
```json
{
    "model": { ... },
    "stats": {
        "modelId": "byom-1",
        "name": "Llama-2-70B-Local",
        "isAvailable": true,
        "lastHealthCheckAt": "2024-01-15T10:45:00Z",
        "usage": {
            "totalRequests": 1523,
            "totalInputTokens": 145000,
            "totalOutputTokens": 89000,
            "totalTokens": 234000,
            "avgResponseTime": 450
        },
        "uptimePercent": 99.95,
        "totalCalls": 1523
    }
}
```

#### Update Model
```http
PUT /api/byom/models/byom-1
Content-Type: application/json

{
    "organizationId": "org-123",
    "temperature": 0.8,
    "costPer1kTokens": 0.000002
}
```

### Health Monitoring

#### Record Health Check
```http
POST /api/byom/models/byom-1/health-check
Content-Type: application/json

{
    "organizationId": "org-123",
    "status": "healthy",
    "responseTimeMs": 450,
    "statusCode": 200,
    "metrics": {
        "tokensPerSecond": 150,
        "memoryUsagePercent": 75,
        "gpuUsagePercent": 85,
        "cpuUsagePercent": 45
    }
}
```

**Response**:
```json
{
    "healthCheck": {
        "id": "check-1",
        "status": "healthy",
        "responseTimeMs": 450,
        "timestamp": "2024-01-15T10:45:00Z"
    }
}
```

### Model Invocation

#### Invoke Completion
```http
POST /api/byom/models/byom-1/invoke
Content-Type: application/json

{
    "organizationId": "org-123",
    "prompt": "Explain machine learning in one sentence.",
    "maxTokens": 100,
    "temperature": 0.7,
    "stream": false
}
```

**Response**:
```json
{
    "output": "Machine learning is a field of computer science that enables systems to learn and improve from experience without being explicitly programmed.",
    "tokens": {
        "input": 8,
        "output": 25
    }
}
```

### Version Management

#### List Versions
```http
GET /api/byom/models/byom-1/versions?organizationId=org-123
```

**Response**:
```json
{
    "versions": [
        {
            "id": "v-1",
            "versionNumber": "v1.0",
            "status": "active",
            "isProduction": true,
            "rolloutPercentage": 100,
            "performanceMetrics": {
                "accuracy": 0.95,
                "f1": 0.92
            }
        }
    ]
}
```

#### Create Version
```http
POST /api/byom/models/byom-1/versions
Content-Type: application/json

{
    "organizationId": "org-123",
    "versionNumber": "v1.1-ft",
    "description": "Fine-tuned on customer support data",
    "finetuneParameters": {
        "learningRate": 1e-4,
        "epochs": 3,
        "batchSize": 32
    },
    "performanceMetrics": {
        "supportAccuracy": 0.97,
        "responseTime": 300
    }
}
```

#### Activate Version
```http
POST /api/byom/models/byom-1/versions/v-1/activate?organizationId=org-123
```

**Response**:
```json
{
    "version": {
        "id": "v-1",
        "status": "active",
        "isProduction": true,
        "activatedAt": "2024-01-15T10:50:00Z"
    },
    "message": "Version activated"
}
```

### Access Control

#### Grant Model Access
```http
POST /api/byom/models/byom-1/access
Content-Type: application/json

{
    "organizationId": "org-123",
    "subjectType": "team",
    "subjectId": "team-analytics",
    "accessLevel": "use",
    "constraints": {
        "maxTokensPerDay": 1000000,
        "maxRequestsPerDay": 10000,
        "expiresAt": "2024-12-31T23:59:59Z"
    }
}
```

**Response** (201):
```json
{
    "access": {
        "id": "access-1",
        "subjectType": "team",
        "accessLevel": "use",
        "grantedAt": "2024-01-15T10:00:00Z"
    },
    "message": "Access granted"
}
```

## Service Usage

### Register and Use BYOM Model

```typescript
import { BYOMService } from '@/src/services/byomService';

// Register self-hosted model
const model = await BYOMService.registerModel({
    organizationId: 'org-123',
    name: 'Llama-2-70B-Local',
    type: 'llama',
    hostingType: 'self-hosted',
    endpointUrl: 'https://ml.internal.company.com:5000',
    authMethod: 'bearer_token',
    apiKey: 'sk-local-...',
    maxTokens: 4096,
    contextWindow: 4096,
    supportsTokenCounting: true,
    createdBy: 'user-123',
});

// Grant team access
await BYOMService.grantAccess(
    model.id,
    'org-123',
    'team',
    'team-analytics',
    'use',
    'user-123',
    {
        maxTokensPerDay: 1000000,
        expiresAt: new Date('2024-12-31'),
    }
);

// Invoke model
const result = await BYOMService.invokeCompletion(
    model.id,
    'user-456',
    'org-123',
    {
        prompt: 'Explain machine learning',
        maxTokens: 100,
        temperature: 0.7,
    }
);

console.log(result);
// {
//   success: true,
//   output: 'Machine learning is...',
//   tokens: { input: 8, output: 25 }
// }

// Get model statistics
const stats = await BYOMService.getModelStats(model.id, 'org-123');
console.log(stats);
// {
//   name: 'Llama-2-70B-Local',
//   isAvailable: true,
//   usage: { totalRequests: 1523, totalTokens: 234000, avgResponseTime: 450 },
//   uptimePercent: 99.95,
//   totalCalls: 1523
// }
```

### Health Monitoring

```typescript
// Record health check
await BYOMService.recordHealthCheck(
    model.id,
    'org-123',
    'healthy',
    450, // responseTimeMs
    200, // statusCode
    undefined, // errorMessage
    {
        tokensPerSecond: 150,
        memoryUsagePercent: 75,
        gpuUsagePercent: 85,
    }
);

// Get health history
const history = await BYOMService.getHealthCheckHistory(model.id, 'org-123', 100);
console.log(history);
```

### Version Management

```typescript
// Create fine-tuned version
const version = await BYOMService.createVersion(
    model.id,
    'org-123',
    {
        versionNumber: 'v1.1-ft',
        description: 'Fine-tuned on customer support data',
        finetuneParameters: {
            learningRate: 1e-4,
            epochs: 3,
            batchSize: 32,
        },
        performanceMetrics: {
            accuracy: 0.97,
            supportAccuracy: 0.97,
        },
        createdBy: 'user-123',
    }
);

// Activate version
await BYOMService.activateVersion(version.id, model.id);
```

## Security Best Practices

1. **API Key Management**:
   - Encrypt API keys at rest
   - Rotate keys regularly
   - Use workspace/environment-specific keys

2. **Access Control**:
   - Grant minimum necessary permissions
   - Use role-based access for large teams
   - Implement quota limits per user/team

3. **Network Security**:
   - Use mTLS for internal connections
   - Restrict endpoint access by IP
   - Encrypt all traffic (TLS 1.2+)

4. **Audit & Monitoring**:
   - Log all model invocations
   - Track token usage per user
   - Monitor health checks and uptime

5. **Data Privacy**:
   - Implement data retention policies
   - Ensure data residency requirements met
   - Use private models for sensitive workloads

## Roadmap

### Phase 3.6.1: Advanced Fine-tuning
- [ ] Web UI for fine-tuning management
- [ ] Dataset versioning and management
- [ ] Fine-tuning progress tracking
- [ ] Evaluation framework integration

### Phase 3.6.2: Performance Optimization
- [ ] Model quantization support (Q4, Q8)
- [ ] Batch processing API
- [ ] Model ensemble combinations
- [ ] Latency prediction

### Phase 3.6.3: Integration & Ecosystem
- [ ] Ollama integration
- [ ] vLLM / TensorRT integration
- [ ] Model marketplace
- [ ] Community model registry

### Phase 3.6.4: Enterprise Features
- [ ] Multi-region deployment
- [ ] Automatic failover
- [ ] Load balancing
- [ ] A/B testing framework
