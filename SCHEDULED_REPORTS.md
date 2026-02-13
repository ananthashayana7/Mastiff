# Scheduled Reports System

## Overview

The Scheduled Reports system automates periodic report generation and delivery. Reports run on a configured schedule, execute templates or queries, and automatically deliver results via email to specified recipients.

**Key Features:**
- Cron-based scheduling with timezone support
- Template, query, and notebook-based reports
- Automatic email delivery with attachments
- Execution history and statistics
- Manual execution capability
- Delivery tracking and retry logic
- Multiple output formats (PDF, CSV, HTML, email)
- Recipient management and distribution groups

## Architecture

### Database Schema

#### `scheduled_reports`
Stores report configuration and metadata.

```sql
CREATE TABLE scheduled_reports (
    id UUID PRIMARY KEY,
    userId UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Report Definition
    templateId UUID,
    type VARCHAR(50),              -- 'template' | 'query' | 'notebook'
    format VARCHAR(50),            -- 'pdf' | 'csv' | 'html' | 'email'
    
    -- Schedule
    schedule VARCHAR(100) NOT NULL,    -- Cron expression
    timezone VARCHAR(50) DEFAULT 'UTC',
    isActive BOOLEAN DEFAULT true,
    
    -- Content
    title VARCHAR(255),
    headerText TEXT,
    footerText TEXT,
    includeCharts BOOLEAN,
    includeRawData BOOLEAN,
    
    -- Recipients
    recipients JSONB,              -- [{email, name}, ...]
    recipientGroups JSONB,         -- Distribution groups
    ccRecipients JSONB,
    bccRecipients JSONB,
    
    -- Parameters
    parameters JSONB,
    filters JSONB,
    
    -- Tracking
    lastExecutedAt TIMESTAMP,
    nextExecutedAt TIMESTAMP,
    executionCount INT DEFAULT 0,
    failureCount INT DEFAULT 0,
    
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);
```

#### `report_executions`
Tracks each report execution.

```sql
CREATE TABLE report_executions (
    id UUID PRIMARY KEY,
    reportId UUID NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
    
    startedAt TIMESTAMP,
    completedAt TIMESTAMP,
    executionTimeMs INT,
    
    status VARCHAR(50),            -- 'pending' | 'running' | 'completed' | 'failed'
    error TEXT,
    
    reportDataUrl TEXT,            -- URL to generated report
    reportSize INT,                -- Bytes
    
    deliveryStatus VARCHAR(50),    -- 'pending' | 'sent' | 'failed'
    deliveredAt TIMESTAMP,
    deliveryError TEXT,
    
    successfulRecipients JSONB,    -- [emails...]
    failedRecipients JSONB,        -- [{email, reason}...]
    
    triggeredBy VARCHAR(50),       -- 'schedule' | 'manual' | 'api'
    triggeredByUserId UUID
);
```

#### `report_recipients`
Master list of report recipients.

```sql
CREATE TABLE report_recipients (
    id UUID PRIMARY KEY,
    userId UUID NOT NULL,
    
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    
    groups JSONB,                  -- ['quarterly', 'executive']
    isActive BOOLEAN DEFAULT true,
    
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);
```

#### `email_templates`
Customizable email templates.

```sql
CREATE TABLE email_templates (
    id UUID PRIMARY KEY,
    userId UUID,                   -- NULL for system templates
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    isSystemTemplate BOOLEAN DEFAULT false,
    
    subject VARCHAR(500) NOT NULL,
    htmlBody TEXT,
    plainTextBody TEXT,
    
    variables JSONB,               -- Supported variables
    
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);
```

#### `report_distribution_log`
Detailed log of each email sent.

```sql
CREATE TABLE report_distribution_log (
    id UUID PRIMARY KEY,
    executionId UUID NOT NULL REFERENCES report_executions(id) ON DELETE CASCADE,
    
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    
    sentAt TIMESTAMP DEFAULT NOW(),
    status VARCHAR(50),            -- 'sent' | 'failed' | 'bounced'
    error TEXT,
    externalMessageId VARCHAR,     -- Provider reference
    
    provider VARCHAR(50)           -- 'sendgrid' | 'mailgun' | 'smtp'
);
```

## Service Layer

### ScheduledReportService

```typescript
// Create a scheduled report
static async createScheduledReport(
    userId: string,
    reportConfig: {
        name: string;
        type: 'template' | 'query' | 'notebook';
        schedule: string;          // Cron expression
        title: string;
        recipients: {email: string; name?: string}[];
        parameters?: any;
        filters?: any;
    }
): Promise<string>

// Get specific report
static async getScheduledReport(reportId: string): Promise<any>

// List user's reports
static async listScheduledReports(userId: string): Promise<any[]>

// Update report
static async updateScheduledReport(
    reportId: string,
    userId: string,
    updates: Partial<ScheduledReport>
): Promise<void>

// Delete report
static async deleteScheduledReport(reportId: string, userId: string): Promise<void>

// Execute immediately
static async executeReport(reportId: string, triggeredBy?: 'schedule'|'manual'): Promise<string>

// Get execution history
static async getExecutionHistory(reportId: string, limit?, offset?): Promise<any[]>

// Get statistics
static async getExecutionStats(reportId: string): Promise<any>

// Initialize on startup
static async initializeScheduledReports(): Promise<void>

// Cleanup on shutdown
static shutdown(): void
```

## API Endpoints

### List Reports

**GET /api/reports**

List all scheduled reports for authenticated user.

**Query Parameters:**
- `type`: Filter by type ('template', 'query', 'notebook')
- `active`: Filter by status (true/false)

**Response:**
```json
{
    "success": true,
    "reports": [
        {
            "id": "report-123",
            "userId": "user-456",
            "name": "Weekly Sales Report",
            "description": "Sales metrics every Monday",
            "type": "template",
            "schedule": "0 9 * * 1",
            "timezone": "America/New_York",
            "title": "Sales Report",
            "recipients": [
                {"email": "alice@company.com", "name": "Alice"},
                {"email": "bob@company.com", "name": "Bob"}
            ],
            "isActive": true,
            "lastExecutedAt": "2024-01-15T09:00:00Z",
            "nextExecutedAt": "2024-01-22T09:00:00Z",
            "executionCount": 24,
            "failureCount": 1,
            "createdAt": "2024-01-01T00:00:00Z"
        }
    ]
}
```

**Rate Limit:** 200 requests/hour

---

### Create Report

**POST /api/reports**

Create a new scheduled report.

**Request:**
```json
{
    "name": "Weekly Sales Report",
    "description": "Sales metrics every Monday",
    "templateId": "template-123",
    "type": "template",
    "format": "pdf",
    "schedule": "0 9 * * 1",
    "timezone": "America/New_York",
    "title": "Sales Report",
    "headerText": "Weekly Report",
    "recipients": [
        {"email": "alice@company.com", "name": "Alice"},
        {"email": "bob@company.com", "name": "Bob"}
    ],
    "parameters": {
        "region": "North America",
        "includeForecasts": true
    },
    "filters": {
        "minRevenue": 1000,
        "customerType": "enterprise"
    }
}
```

**Response:**
```json
{
    "success": true,
    "reportId": "report-789",
    "message": "Report created"
}
```

**Rate Limit:** 50 requests/hour

---

### Get Report

**GET /api/reports/[id]**

Get specific report configuration.

**Response:**
```json
{
    "success": true,
    "report": {
        "id": "report-123",
        "userId": "user-456",
        "name": "Weekly Sales Report",
        "type": "template",
        "templateId": "template-123",
        "schedule": "0 9 * * 1",
        "title": "Sales Report",
        "recipients": [...],
        "parameters": {...},
        "filters": {...},
        "isActive": true,
        "lastExecutedAt": "2024-01-15T09:00:00Z",
        "nextExecutedAt": "2024-01-22T09:00:00Z"
    }
}
```

**Rate Limit:** 300 requests/hour

---

### Update Report

**PUT /api/reports/[id]**

Update report configuration.

**Request:**
```json
{
    "name": "Weekly Sales Report (Updated)",
    "schedule": "0 8 * * 1",
    "recipients": [
        {"email": "alice@company.com"},
        {"email": "charlie@company.com"}
    ],
    "isActive": true
}
```

**Response:**
```json
{
    "success": true,
    "message": "Report updated"
}
```

**Rate Limit:** 100 requests/hour

---

### Delete Report

**DELETE /api/reports/[id]**

Delete a scheduled report (stops execution).

**Response:**
```json
{
    "success": true,
    "message": "Report deleted"
}
```

**Rate Limit:** 50 requests/hour

---

### Execute Report

**POST /api/reports/[id]/execute**

Manually trigger report execution.

**Response:**
```json
{
    "success": true,
    "executionId": "exec-456",
    "message": "Report started"
}
```

**Rate Limit:** 100 requests/hour

---

### Execution History

**GET /api/reports/[id]/executions**

Get execution history with pagination.

**Query Parameters:**
- `limit`: Max results (default: 50, max: 100)
- `offset`: Pagination offset

**Response:**
```json
{
    "success": true,
    "executions": [
        {
            "id": "exec-456",
            "reportId": "report-123",
            "startedAt": "2024-01-15T09:00:00Z",
            "completedAt": "2024-01-15T09:05:23Z",
            "executionTimeMs": 323000,
            "status": "completed",
            "deliveryStatus": "sent",
            "deliveredAt": "2024-01-15T09:05:30Z",
            "successfulRecipients": ["alice@company.com", "bob@company.com"],
            "failedRecipients": [],
            "triggeredBy": "schedule"
        }
    ],
    "limit": 50,
    "offset": 0
}
```

**Rate Limit:** 200 requests/hour

---

## Cron Schedule Format

Reports use standard cron expressions for scheduling.

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

### Examples

```
0 9 * * 1       # Every Monday at 9:00 AM
0 9 * * MON     # Every Monday at 9:00 AM (alternative)
*/15 * * * *    # Every 15 minutes
0 0 1 * *       # First day of every month at midnight
0 0 * * *       # Every day at midnight
0 9 * * 1-5     # Weekdays at 9:00 AM
0 9,17 * * *    # 9:00 AM and 5:00 PM daily
```

## Report Types

### 1. Template-Based Reports

Execute a template and format results as a report.

```json
{
    "type": "template",
    "templateId": "template-123",
    "parameters": {
        "region": "North America",
        "timeFrame": "monthly"
    }
}
```

### 2. Query-Based Reports

Execute a SQL query against a connector.

```json
{
    "type": "query",
    "connectorId": "conn-456",
    "query": "SELECT DATE(date), SUM(revenue) FROM sales WHERE region = ? GROUP BY 1",
    "parameters": ["North America"]
}
```

### 3. Notebook-Based Reports

Execute a notebook and capture output.

```json
{
    "type": "notebook",
    "notebookId": "nb-789",
    "parameters": {
        "analysis_type": "forecast"
    }
}
```

## Output Formats

### PDF
Professional report with formatting, charts, and images.

```json
{
    "format": "pdf",
    "includeCharts": true,
    "includeRawData": false,
    "headerText": "Monthly Sales Report",
    "footerText": "Confidential"
}
```

### CSV
Raw data in comma-separated format for spreadsheet import.

```json
{
    "format": "csv"
}
```

### HTML
Email-friendly HTML report.

```json
{
    "format": "html"
}
```

### Email
Send as email body with optional attachment.

```json
{
    "format": "email"
}
```

## Recipient Management

### Direct Recipients

```json
{
    "recipients": [
        {"email": "alice@company.com", "name": "Alice Smith"},
        {"email": "bob@company.com", "name": "Bob Jones"}
    ]
}
```

### Distribution Groups

Create lists of recipients for easy reuse.

```json
{
    "recipientGroups": ["sales_team", "executives"]
}
```

### CC and BCC

```json
{
    "recipients": [...],
    "ccRecipients": [{"email": "manager@company.com"}],
    "bccRecipients": [{"email": "archive@company.com"}]
}
```

## Execution Scenarios

### Scenario 1: Weekly Sales Report

```javascript
// Create
const report = await fetch('/api/reports', {
    method: 'POST',
    body: JSON.stringify({
        name: 'Weekly Sales Report',
        type: 'template',
        templateId: 'sales-template',
        schedule: '0 9 * * 1',  // Monday 9 AM
        timezone: 'America/New_York',
        title: 'Sales Metrics',
        recipients: [
            {email: 'sales-team@company.com', name: 'Sales Team'}
        ],
        parameters: {
            reportType: 'weekly',
            includeForecasts: true
        }
    })
});

// Get scheduled execution
const schedule = await fetch('/api/reports/report-123');

// History
const history = await fetch('/api/reports/report-123/executions');

// Manual execution
const exec = await fetch('/api/reports/report-123/execute', {
    method: 'POST'
});
```

### Scenario 2: Monthly Financial Report

```javascript
const report = await fetch('/api/reports', {
    method: 'POST',
    body: JSON.stringify({
        name: 'Monthly Financial Summary',
        type: 'template',
        templateId: 'financial-template',
        schedule: '0 8 1 * *',  // First day of month at 8 AM UTC
        timezone: 'UTC',
        format: 'pdf',
        title: 'Financial Summary',
        recipients: [
            {email: 'cfo@company.com', name: 'CFO'},
            {email: 'controller@company.com', name: 'Controller'}
        ],
        ccRecipients: [
            {email: 'finance-team@company.com'}
        ],
        parameters: {
            fiscal_period: 'monthly',
            include_variance: true
        }
    })
});
```

## Delivery & Retry Logic

### Success Criteria
- Report execution completes without error
- All recipients receive email successfully
- Delivery notification received from email provider

### Retry Behavior
- **Initial failure:** 3 automatic retries with 5-minute intervals
- **Persistent failure:** Email sent to report owner with details
- **History:** All attempts logged in distribution log

### Bounce Handling
- Hard bounces: Recipient marked inactive
- Soft bounces: Retried with exponential backoff
- Spam complaints: Recipient removed from list

## Monitoring & Debugging

### Statistics

```javascript
const stats = await fetch('/api/reports/report-123/stats');
// {
//   "reportId": "report-123",
//   "totalExecutions": 24,
//   "successfulExecutions": 23,
//   "failedExecutions": 1,
//   "successRate": 95.83,
//   "lastExecutedAt": "2024-01-15T09:00:00Z",
//   "nextExecutedAt": "2024-01-22T09:00:00Z"
// }
```

### Execution Details

```javascript
const execution = await fetch('/api/reports/report-123/executions?limit=1');
// {
//   "executions": [{
//     "id": "exec-456",
//     "status": "completed",
//     "executionTimeMs": 323000,
//     "deliveryStatus": "sent",
//     "successfulRecipients": ["alice@company.com"],
//     "failedRecipients": []
//   }]
// }
```

## Best Practices

1. **Test Before Scheduling**
   - Use manual execution first
   - Review report format and content
   - Confirm recipients receive properly

2. **Schedule During Off-Hours**
   - Avoid peak load times
   - Use timezone-aware scheduling
   - Consider recipient time zones

3. **Monitor Delivery**
   - Check execution history regularly
   - Set up alerts for failures
   - Review bounce rates

4. **Manage Recipients**
   - Keep lists current
   - Remove inactive addresses
   - Use distribution groups

5. **Parameter Management**
   - Document custom parameters
   - Validate inputs
   - Test edge cases

## Limitations

- **Max reports per user:** 100
- **Max execution history:** 1000 records per report
- **Max recipients per report:** 500
- **Report size limit:** 50 MB
- **Execution timeout:** 30 minutes
- **Retry attempts:** 3
- **Retention period:** 90 days

## Integration with Other Features

### With Templates
Reports can execute templates with custom parameters and filters for tailored output.

### With Connectors
Query-based reports execute against any configured data source.

### With Notebooks
Notebook reports capture rich output including visualizations and computations.

### With Caching
Large reports use cached query results to reduce execution time.

---

For more information on templates, connectors, or notebooks, refer to their respective documentation.
