# Template System Documentation

## Overview

The Template System enables users to create reusable analysis workflows that combine connector queries, Python notebooks, and visualizations. Templates can be versioned, executed with different inputs, and shared publicly.

## Architecture

### Database Schema

#### `templates`
Stores template definitions with metadata.

```sql
CREATE TABLE templates (
    id UUID PRIMARY KEY,
    userId UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    inputs JSONB,              -- Template parameter definitions
    steps JSONB,               -- Workflow steps (query, notebook, transformation, viz)
    outputs JSONB,             -- Output definitions
    tags VARCHAR(500),
    isPublic BOOLEAN DEFAULT false,
    executionCount INT DEFAULT 0,
    favoriteCount INT DEFAULT 0,
    createdAt TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP NOT NULL
);
```

#### `templateExecutions`
Tracks template execution history with timing and results.

```sql
CREATE TABLE templateExecutions (
    id UUID PRIMARY KEY,
    templateId UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    userId UUID NOT NULL,
    inputs JSONB,               -- User-provided inputs
    outputs JSONB,              -- Execution results
    error VARCHAR(500),
    executionTimeMs INT,
    startedAt TIMESTAMP,
    completedAt TIMESTAMP,
    FOREIGN KEY (templateId) REFERENCES templates(id)
);
```

#### `templateVersions`
Maintains version history with changelog.

```sql
CREATE TABLE templateVersions (
    id UUID PRIMARY KEY,
    templateId UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    versionNumber INT NOT NULL,
    steps JSONB,
    changelog TEXT,
    createdAt TIMESTAMP NOT NULL,
    FOREIGN KEY (templateId) REFERENCES templates(id)
);
```

#### `templateFavorites`
User favorite tracking (like/bookmark feature).

```sql
CREATE TABLE templateFavorites (
    id UUID PRIMARY KEY,
    templateId UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    userId UUID NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    FOREIGN KEY (templateId) REFERENCES templates(id)
);
```

## Service Layer

### TemplateService

Provides business logic for template operations:

```typescript
// CRUD Operations
static async createTemplate(userId, templateData): Promise<string>
static async getTemplate(templateId): Promise<Template>
static async updateTemplate(templateId, userId, updates): Promise<void>
static async deleteTemplate(templateId, userId): Promise<void>

// Versioning
static async getTemplateVersion(templateId, versionNumber): Promise<TemplateVersion>

// Listing
static async listTemplates(filters): Promise<Template[]>

// Execution
static async recordExecution(templateId, userId, inputs, outputs, error, timeMs): Promise<void>
static async getExecutionHistory(templateId, limit, offset): Promise<Execution[]>

// Favorites
static async toggleFavorite(templateId, userId): Promise<void>
static async getFavoritesCount(templateId): Promise<number>
```

## API Endpoints

### Template Management

#### POST /api/templates
Create a new template.

**Request:**
```json
{
    "name": "Customer Segmentation",
    "description": "Segment customers using K-Means",
    "category": "Analytics",
    "inputs": [
        {
            "name": "numClusters",
            "type": "number",
            "required": false,
            "default": 3
        }
    ],
    "steps": [
        {
            "id": "fetch_data",
            "type": "query",
            "connectorId": "conn-123",
            "query": "SELECT * FROM customers LIMIT 1000",
            "outputs": ["customer_data"]
        },
        {
            "id": "cluster",
            "type": "notebook",
            "code": "from sklearn.cluster import KMeans...",
            "outputs": ["clusters"]
        }
    ],
    "outputs": ["clusters", "visualization"],
    "isPublic": false
}
```

**Response:**
```json
{
    "success": true,
    "templateId": "tmpl-uuid-123",
    "message": "Template created"
}
```

**Rate Limit:** 50 requests/hour

---

#### GET /api/templates
List templates (with optional filters).

**Query Parameters:**
- `category`: Filter by category
- `limit`: Max results (default: 50, max: 100)
- `offset`: Pagination offset
- `public`: Show public templates (true/false)

**Response:**
```json
{
    "success": true,
    "templates": [
        {
            "id": "tmpl-uuid-123",
            "userId": "user-uuid",
            "name": "Customer Segmentation",
            "description": "Segment customers using K-Means",
            "category": "Analytics",
            "inputs": [],
            "steps": [],
            "outputs": [],
            "tags": "clustering,customers",
            "isPublic": false,
            "executionCount": 5,
            "favoriteCount": 2,
            "createdAt": "2024-01-15T10:30:00Z"
        }
    ],
    "limit": 50,
    "offset": 0
}
```

**Rate Limit:** 200 requests/hour

---

#### GET /api/templates/[id]
Get a specific template.

**Response:**
```json
{
    "success": true,
    "template": {
        "id": "tmpl-uuid-123",
        "userId": "user-uuid",
        "name": "Customer Segmentation",
        "description": "...",
        "inputs": [
            {
                "name": "numClusters",
                "type": "number",
                "required": false,
                "default": 3,
                "description": "Number of clusters"
            }
        ],
        "steps": [
            {
                "id": "fetch_data",
                "type": "query",
                "connectorId": "conn-123",
                "query": "SELECT ...",
                "outputs": ["customer_data"]
            }
        ],
        "outputs": ["clusters"],
        "isPublic": false,
        "executionCount": 5,
        "favoriteCount": 2
    }
}
```

**Rate Limit:** 300 requests/hour

---

#### PUT /api/templates/[id]
Update a template.

**Request:**
```json
{
    "name": "Customer Segmentation v2",
    "category": "Analytics",
    "steps": [
        {
            "id": "fetch_data",
            "type": "query",
            "connectorId": "conn-456",
            "query": "SELECT * FROM customers_v2 LIMIT 2000",
            "outputs": ["customer_data"]
        }
    ]
}
```

**Response:**
```json
{
    "success": true,
    "message": "Template updated"
}
```

**Note:** Updating `steps` automatically creates a new version.

**Rate Limit:** 100 requests/hour

---

#### DELETE /api/templates/[id]
Delete a template (cascades to all versions and executions).

**Response:**
```json
{
    "success": true,
    "message": "Template deleted"
}
```

**Rate Limit:** 50 requests/hour

---

### Template Execution

#### POST /api/templates/[id]/execute
Execute a template with provided inputs.

**Request:**
```json
{
    "numClusters": 5,
    "connectorId": "conn-123",
    "tableName": "customers"
}
```

**Response:**
```json
{
    "success": true,
    "outputs": {
        "clusters": {
            "cluster_id": [1, 2, 3, 1, 2, ...],
            "customer_id": [101, 102, 103, ...],
            "metrics": {...}
        },
        "visualization": {
            "type": "bar",
            "data": {...}
        }
    },
    "inputs": {
        "numClusters": 5
    },
    "executionTimeMs": 2341
}
```

**Error Response:**
```json
{
    "success": false,
    "error": "Missing required inputs: connectorId",
    "inputs": {...},
    "executionTimeMs": 145
}
```

**Rate Limit:** 100 requests/hour

---

#### GET /api/templates/[id]/executions
Get execution history.

**Query Parameters:**
- `limit`: Max results (default: 50, max: 100)
- `offset`: Pagination offset

**Response:**
```json
{
    "success": true,
    "executions": [
        {
            "id": "exec-uuid-1",
            "templateId": "tmpl-uuid-123",
            "userId": "user-uuid",
            "inputs": {
                "numClusters": 5
            },
            "outputs": {
                "clusters": {...}
            },
            "error": null,
            "executionTimeMs": 2341,
            "startedAt": "2024-01-15T10:30:00Z",
            "completedAt": "2024-01-15T10:30:02Z"
        }
    ],
    "limit": 50,
    "offset": 0
}
```

**Rate Limit:** 200 requests/hour

---

#### PATCH /api/templates/[id]/favorite
Toggle favorite status (like/bookmark).

**Response:**
```json
{
    "success": true,
    "message": "Favorite toggled"
}
```

**Rate Limit:** 200 requests/hour

## Step Types

### 1. Query Step
Executes a query against a Data Connector.

```typescript
{
    "id": "query_step_1",
    "type": "query",
    "connectorId": "conn-123",
    "query": "SELECT * FROM ${tableName} WHERE region = '${region}'",
    "outputs": ["query_result"]
}
```

**Features:**
- Variable interpolation using `${variableName}`
- Parameterized queries to prevent SQL injection
- Support for all connector types

---

### 2. Notebook Step
Executes Python code in a sandboxed notebook environment.

```typescript
{
    "id": "notebook_step_1",
    "type": "notebook",
    "code": `
import pandas as pd
import numpy as np

df = pd.DataFrame(query_result)
summary = {
    'rows': len(df),
    'columns': list(df.columns),
    'numeric_cols': list(df.select_dtypes(include=[np.number]).columns)
}
`,
    "outputs": ["summary"]
}
```

**Features:**
- Full Python execution environment
- Access to pandas, numpy, scikit-learn
- Variables from previous steps available

---

### 3. Transformation Step
Apply data transformations (similar to notebook).

```typescript
{
    "id": "transform_step_1",
    "type": "transformation",
    "code": `
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
normalized = scaler.fit_transform(query_result)
`,
    "outputs": ["normalized_data"]
}
```

---

### 4. Visualization Step
Define chart configuration.

```typescript
{
    "id": "viz_step_1",
    "type": "visualization",
    "code": `
{
    "type": "bar",
    "data": {
        "labels": ["A", "B", "C"],
        "datasets": [{
            "label": "Values",
            "data": [10, 20, 15]
        }]
    },
    "options": {
        "responsive": true,
        "plugins": {
            "title": {
                "display": true,
                "text": "My Chart"
            }
        }
    }
}
`,
    "outputs": ["chart"]
}
```

## Pre-built Templates

The system includes 4 pre-built templates:

### 1. Customer Segmentation (K-Means)
- **ID:** `template_segmentation_kmeans`
- **Purpose:** Segment customers into clusters
- **Inputs:** Data source, feature columns, number of clusters
- **Outputs:** Cluster assignments, silhouette scores

### 2. Demand Forecasting (ARIMA)
- **ID:** `template_forecasting_arima`
- **Purpose:** Forecast future demand
- **Inputs:** Historical data, forecast periods
- **Outputs:** Predicted values, confidence intervals

### 3. Churn Prediction (Logistic Regression)
- **ID:** `template_churn_logistic`
- **Purpose:** Predict customer churn probability
- **Inputs:** Customer features, train/test split
- **Outputs:** Model metrics, predictions, probabilities

### 4. RFM Segmentation
- **ID:** `template_rft_analysis`
- **Purpose:** Recency, Frequency, Monetary analysis
- **Inputs:** Transaction history
- **Outputs:** RFM scores per customer

## Usage Examples

### Example 1: Create and Execute a Custom Template

```javascript
// Create template
const createResponse = await fetch('/api/templates', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=...'
    },
    body: JSON.stringify({
        name: 'Sales Analysis',
        category: 'Analytics',
        inputs: [
            {
                name: 'startDate',
                type: 'date',
                required: true
            }
        ],
        steps: [
            {
                id: 'fetch_sales',
                type: 'query',
                connectorId: 'conn-123',
                query: 'SELECT * FROM sales WHERE date >= ${startDate}',
                outputs: ['sales_data']
            },
            {
                id: 'summarize',
                type: 'notebook',
                code: 'summary = sales_data.groupby("region").sum()',
                outputs: ['summary']
            }
        ],
        outputs: ['summary']
    })
});

const { templateId } = await createResponse.json();

// Execute template
const executeResponse = await fetch(`/api/templates/${templateId}/execute`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=...'
    },
    body: JSON.stringify({
        startDate: '2024-01-01'
    })
});

const { outputs, executionTimeMs } = await executeResponse.json();
console.log('Results:', outputs);
console.log(`Executed in ${executionTimeMs}ms`);
```

### Example 2: Use Pre-built Template

```javascript
// Access pre-built segmentation template
const response = await fetch('/api/templates/template_segmentation_kmeans', {
    headers: { 'Cookie': 'session=...' }
});

const template = await response.json();

// Execute with custom parameters
const execResponse = await fetch(
    '/api/templates/template_segmentation_kmeans/execute',
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': 'session=...'
        },
        body: JSON.stringify({
            connectorId: 'my-connector',
            tableName: 'my_customers',
            numClusters: 4
        })
    }
);

const { outputs } = await execResponse.json();
```

### Example 3: Access Execution History

```javascript
const historyResponse = await fetch(
    '/api/templates/tmpl-uuid-123/executions?limit=10',
    {
        headers: { 'Cookie': 'session=...' }
    }
);

const { executions } = await historyResponse.json();

executions.forEach(exec => {
    console.log(`Execution ${exec.id}: ${exec.executionTimeMs}ms`);
    if (exec.error) {
        console.error('Error:', exec.error);
    }
});
```

## Error Handling

### Common Errors

```json
{
    "error": "Missing required inputs: connectorId, tableName"
}
```

```json
{
    "error": "Template not found"
}
```

```json
{
    "error": "Forbidden - you do not have access to this template"
}
```

```json
{
    "error": "Execution failed - connector test returned error"
}
```

## Versioning

When a template's `steps` are updated:

1. **New version created** with version number incremented
2. **Changelog recorded** in `templateVersions` table
3. **Previous versions preserved** for rollback
4. **Executions track** which version was used

## Caching

Template execution results are cached using the Redis cache service:

- **Cache key:** `template:{templateId}:execution:{hash}`
- **TTL:** 1 hour (configurable)
- **Invalidation:** Automatic on new execution

Cache tags allow rapid invalidation:
- `template:{templateId}` - Clear all results for template
- `connector:{connectorId}` - Clear affected template results

## Security

### Access Control
- **Private templates:** Only owner can view/execute
- **Public templates:** Anyone can view/execute
- **Updates/delete:** Owner only

### Rate Limiting
- **Create:** 50/hour
- **List:** 200/hour
- **Get:** 300/hour
- **Update:** 100/hour
- **Delete:** 50/hour
- **Execute:** 100/hour
- **Favorite:** 200/hour

### Audit Logging
All operations logged:
- Template CRUD actions
- Executions with timing
- User attribution
- Success/failure status

## Best Practices

1. **Name templates clearly** with descriptive names
2. **Document inputs** with helpful descriptions
3. **Use variable interpolation** for flexible queries
4. **Version templates** when making breaking changes
5. **Monitor execution times** for performance optimization
6. **Handle errors** gracefully in transformation steps
7. **Share public templates** for reusability
8. **Archive old executions** periodically

## Integration with Other Features

### With Connectors
Templates reference connectors by ID. Connectors must exist and be accessible by the executing user.

### With Notebooks
Template notebook/transformation steps execute in the same sandbox as standalone notebooks.

### With Caching
Execution results cached automatically. Connector queries benefit from existing connector query cache.

## Limitations

- **Max template size:** 10 MB
- **Max execution time:** 30 minutes
- **Max step count:** 50 steps per template
- **Max input parameters:** 50 parameters
- **Execution history:** Last 1000 executions per template

---

For more information on connectors, notebooks, or the API, refer to their respective documentation files.
