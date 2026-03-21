# Error Tracking & Advanced Alerting - Phase 4.3

Comprehensive error capture, grouping, resolution workflow, and multi-channel alerting system with on-call schedule management for the Mastiff platform.

**Executive Summary**: Error Tracking transforms raw error data into actionable intelligence with automatic grouping, advanced alerting rules, escalation policies, and integrated on-call management. This enables rapid incident response and data-driven quality improvements.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Service Layer](#service-layer)
4. [API Endpoints](#api-endpoints)
5. [Usage Examples](#usage-examples)
6. [Best Practices](#best-practices)
7. [Integration Guide](#integration-guide)
8. [Roadmap](#roadmap)

---

## Architecture Overview

### Core Components

**Error Tracking Stack**:

```
Client Applications (JavaScript, Python, etc.)
    ↓ (Error with context, breadcrumbs)
API Routes (/api/errors)
    ↓
ErrorTrackingService
    ├── Error Recording
    │   ├── Fingerprinting & Grouping
    │   ├── Stack Trace Parsing
    │   └── Context Capture
    │
    ├── Alert Rules Engine
    │   ├── Rule Evaluation
    │   └── Notification Triggering
    │
    ├── Escalation Management
    │   ├── Multi-Level Escalation
    │   └── On-Call Integration
    │
    └── Resolution Workflow
        ├── Investigation Tracking
        └── Fix Coordination
    ↓
Error Tracking Database Schema
    ├── error_events (Individual occurrences)
    ├── error_groups (Grouped errors)
    ├── error_stack_traces (Stack analysis)
    ├── error_context (User/environment)
    ├── error_breadcrumbs (Preceding events)
    ├── alert_rules (Rule definitions)
    ├── notification_channels (Multi-channel)
    ├── on_call_schedules (Coverage)
    ├── escalation_policies (Escalation paths)
    └── alert_notifications (Sent alerts)
    ↓
Phase 4.1 Observability Integration
    └── recordMetric() - Error metrics
```

### Key Features

| Feature | Purpose | Use Case |
|---------|---------|----------|
| **Error Fingerprinting** | Automatic error grouping | Identify unique bugs vs duplicate reports |
| **Stack Trace Analysis** | Source mapping & line details | Pinpoint root cause in source code |
| **Error Context** | User, session, environment data | Correlate errors with user impact |
| **Breadcrumbs** | Event trail before error | Understand user journey leading to error |
| **Alert Rules** | Multi-condition alerting | Trigger alerts on specific patterns |
| **Notification Channels** | Multi-channel delivery | Email, Slack, PagerDuty, Teams, Discord, SMS |
| **On-Call Schedules** | Team coverage management | Automatic routing to on-call engineer |
| **Escalation Policies** | Multi-level escalation | Automatic escalation if unack'd |
| **Resolution Workflow** | Issue tracking integration | From detection to deployment |

---

## Database Schema

### error_groups

Grouped errors with error fingerprinting for deduplication and aggregation.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID
  workspaceId?: string;            // Optional workspace scope
  
  // Error identification
  errorFingerprint: string;        // SHA256 of error type + message + stack
  errorType: string;               // e.g., "TypeError", "RuntimeError"
  errorMessage: string;            // Full error message
  
  // Status and lifecycle
  status: 'active' | 'ignored' | 'resolved' | 'regression';
  severity: 'critical' | 'high' | 'medium' | 'low';
  
  // Statistics
  totalOccurrences: number;        // Total times occurred
  uniqueUsersAffected: number;     // Count of unique users
  firstOccurredAt: Date;           // When first seen
  lastOccurredAt: Date;            // When last seen
  lastSeenUserId: string;          // Last user to experience
  
  // Assignment and resolution
  assignedToUserId: string;        // Engineer assigned
  resolvedAt?: Date;               // When resolved
  resolutionNotes: string;         // Explanation of fix
  
  // Metadata
  tags: string[];                  // e.g., ["database", "critical"]
  environment: string;             // production, staging, dev
  releaseVersion: string;          // Version where it occurred
  
  createdAt: Date;
  updatedAt: Date;
}
```

### error_events

Individual error occurrences with full context.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID
  errorGroupId: string;            // Reference to group
  
  // Event details
  timestamp: Date;                 // When error occurred
  userId: string;                  // User experiencing error
  sessionId: string;               // Session ID
  
  // Error information
  message: string;                 // Error message
  errorType: string;               // Exception type
  
  // Context
  context: {
    url?: string;
    userAgent?: string;
    ip?: string;
    headers?: object;
    [key: string]: any;
  };
  environment: string;             // production, staging
  releaseVersion: string;          // Version number
  
  // Stack trace reference
  stackTraceId: string;            // Reference to detailed trace
  sourceMapApplied: boolean;       // Source map processed
  
  // Resource metrics at time of error
  memoryMb: number;                // Memory usage
  cpuPercent: number;              // CPU usage
  networkLatencyMs: number;        // Network latency
  
  // Breadcrumbs (preceding events)
  breadcrumbIds: string[];         // References to breadcrumb events
  
  createdAt: Date;
}
```

### error_stack_traces

Parsed stack trace information with source mapping support.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID
  
  // Fingerprinting
  stackTraceHash: string;          // SHA256 for deduplication
  
  // Raw and processed
  rawStackTrace: string;           // Original stack trace text
  processedStackTrace: {           // Parsed frames
    file: string;
    line: number;
    column: number;
    function: string;
    code?: string;
  }[];
  
  // Source mapping
  sourceMapApplied: boolean;       // Was source map used
  originalFilePath: string;        // Pre-minification path
  minifiedFilePath: string;        // Post-minification path
  
  // Root cause analysis
  rootCauseFrame: number;          // Which frame is root cause
  rootCauseFile: string;           // File with root cause
  rootCauseLine: number;           // Line with root cause
  
  createdAt: Date;
}
```

### error_context

Detailed context about error occurrence (user, device, browser, network).

```typescript
{
  id: string;                      // UUID
  errorEventId: string;            // Reference to event
  organizationId: string;          // Tenant ID
  
  // User context
  userId: string;
  userEmail: string;
  userName: string;
  userIpAddress: string;
  
  // Session context
  sessionId: string;
  sessionDurationMs: number;
  
  // Environment
  environment: string;
  releaseVersion: string;
  
  // Browser details
  userAgent: string;               // Full user agent
  browserName: string;             // Chrome, Firefox, Safari
  browserVersion: string;          // Version number
  osName: string;                  // Windows, macOS, Linux
  osVersion: string;               // OS version
  
  // Device
  deviceType: 'mobile' | 'tablet' | 'desktop';
  deviceManufacturer: string;
  
  // Network
  connectionType: 'wifi' | 'cellular' | 'ethernet';
  connectionSpeed: '4g' | '5g' | 'slow-2g';
  
  // Request
  requestUrl: string;
  requestMethod: string;
  requestHeaders: object;
  responseStatus: number;
  
  // Custom data
  customData: object;
  
  createdAt: Date;
}
```

### error_breadcrumbs

Event trail preceding the error (clicks, network calls, console logs, etc.).

```typescript
{
  id: string;                      // UUID
  errorEventId: string;            // Which error this belongs to
  organizationId: string;          // Tenant ID
  
  timestamp: Date;
  category: 'http' | 'navigation' | 'console' | 'ui' | 'database';
  message: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  
  // Category-specific data
  data: {
    // http: { method, url, status, duration }
    // navigation: { from, to, timestamp }
    // console: { method, args }
    // ui: { action, selector, text }
    // database: { query, table, duration }
  };
  
  createdAt: Date;
}
```

### error_resolution

Error resolution workflow tracking.

```typescript
{
  id: string;
  errorGroupId: string;            // Which error group
  organizationId: string;
  
  status: 'investigating' | 'acknowledged' | 'in_progress' | 'resolved';
  resolutionType: 'fix' | 'workaround' | 'wontfix' | 'duplicate';
  
  assignedToUserId: string;        // Engineer assigned
  assignedAt: Date;
  
  investigationStartedAt: Date;
  resolvedAt: Date;
  resolutionTimeMinutes: number;   // Time to resolution
  
  rootCauseAnalysis: string;       // Description of root cause
  fixDescription: string;          // How we fixed it
  fixCommitHash: string;           // Git commit hash
  fixReleaseVersion: string;       // Release version containing fix
  
  createdAt: Date;
  updatedAt: Date;
}
```

### alert_rules

Advanced alerting rule definitions.

```typescript
{
  id: string;
  organizationId: string;
  
  // Definition
  name: string;                    // e.g., "Critical Errors"
  description: string;
  ruleType: string;                // error_rate, new_error, high_severity, user_impact
  
  // Conditions
  conditions: {
    errorType?: string;            // Specific error type
    severity?: string[];           // ['critical', 'high']
    environment?: string[];        // ['production']
    threshold?: number;            // N errors before alert
    timeWindowMinutes?: number;    // Within this time period
    increase?: number;             // % increase threshold
  };
  
  // Actions
  notificationChannelIds: string[];     // Where to send alerts
  escalationPolicyId?: string;          // Escalation if unack'd
  createIncident?: boolean;             // Create incident ticket
  
  // Status
  isEnabled: boolean;
  
  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### notification_channels

Multi-channel notification destinations (email, Slack, PagerDuty, etc.).

```typescript
{
  id: string;
  organizationId: string;
  
  // Channel definition
  name: string;                    // e.g., "Engineering Slack"
  type: string;                    // email, slack, pagerduty, webhook, sms, teams, discord
  
  // Configuration (type-specific)
  config: {
    // email: { recipients: string[] }
    // slack: { webhookUrl, channel }
    // pagerduty: { integrationKey, serviceId }
    // webhook: { url, method, headers }
    // sms: { phoneNumbers: string[] }
  };
  
  // Status
  isEnabled: boolean;
  isVerified: boolean;
  verificationCode?: string;
  
  // Usage tracking
  lastNotificationAt?: Date;
  failureCount: number;
  
  createdAt: Date;
  updatedAt: Date;
}
```

### on_call_schedules

Team on-call coverage management with rotation.

```typescript
{
  id: string;
  organizationId: string;
  
  // Definition
  name: string;                    // e.g., "Engineering On-Call"
  description: string;
  timezone: string;                // e.g., "America/New_York"
  teamId?: string;
  
  // Schedule type
  scheduleType: 'daily' | 'weekly' | 'custom';
  
  // Rotation details
  rotationDetails: {
    type: string;
    daysOfWeek?: string[];
    rotationPeriodDays: number;
    layers: Array<{
      userIds: string[];
      startDate: string;
    }>;
  };
  
  // Current coverage
  currentOnCallUserId?: string;
  currentShiftStartAt?: Date;
  currentShiftEndAt?: Date;
  
  // Status
  isActive: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}
```

### escalation_policies

Multi-level escalation paths with delays and channels.

```typescript
{
  id: string;
  organizationId: string;
  
  // Definition
  name: string;                    // e.g., "Critical Alert Escalation"
  description: string;
  
  // Escalation levels
  levels: Array<{
    level: number;                 // Level 1, 2, 3, etc.
    delayMinutes: number;          // Escalate if unack'd after N mins
    notificationChannelIds: string[]; // Send to these channels
    onCallScheduleIds?: string[];  // Get on-call from these schedules
  }>;
  
  // Status
  isEnabled: boolean;
  
  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### alert_notifications

Sent alert notifications tracking.

```typescript
{
  id: string;
  organizationId: string;
  errorGroupId: string;
  alertRuleId: string;
  notificationChannelId: string;
  
  // Details
  status: 'pending' | 'sent' | 'failed' | 'read';
  message: string;
  
  // Timeline
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failureReason?: string;
  
  // Escalation
  escalationLevel: number;         // Which level (1, 2, 3, ...)
  
  createdAt: Date;
}
```

---

## Service Layer

### ErrorTrackingService

Complete service implementation for error management and alerting.

#### recordError()

Record an error with automatic grouping and context capture.

```typescript
static async recordError(params: {
  organizationId: string;
  workspaceId?: string;
  errorType: string;               // e.g., "TypeError"
  errorMessage: string;            // Full error message
  stackTrace: string;              // Full stack trace
  context: {
    userId?: string;
    sessionId?: string;
    url?: string;
    userAgent?: string;
    ipAddress?: string;
    [key: string]: any;
  };
  breadcrumbs?: Array<{
    category: string;
    level: 'info' | 'warning' | 'error' | 'debug';
    message?: string;
    data?: any;
  }>;
  environment?: string;
  releaseVersion?: string;
  sourceMapId?: string;
}): Promise<{
  errorGroupId: string;
  errorEventId: string;
  isNewGroup: boolean;
}>
```

**Example**:

```typescript
const errorResult = await ErrorTrackingService.recordError({
  organizationId: 'org-123',
  errorType: 'TypeError',
  errorMessage: 'Cannot read property "name" of undefined',
  stackTrace: `TypeError: Cannot read property "name" of undefined
    at getUserName (app.ts:45:10)
    at processUser (service.ts:120:5)
    at handleRequest (handler.ts:200:15)`,
  context: {
    userId: 'user-456',
    sessionId: 'sess-789',
    url: 'https://app.example.com/users/123',
    userAgent: 'Mozilla/5.0...',
    ipAddress: '192.168.1.1',
  },
  breadcrumbs: [
    {
      category: 'http',
      level: 'info',
      message: 'GET /api/users/123',
      data: { status: 200, duration: 125 },
    },
    {
      category: 'ui',
      level: 'info',
      message: 'Click on user profile',
      data: { selector: '.user-profile' },
    },
  ],
  environment: 'production',
  releaseVersion: '2.1.0',
});
```

#### getErrorGroup()

Retrieve error group with related events.

```typescript
static async getErrorGroup(errorGroupId: string): Promise<{
  id: string;
  errorFingerprint: string;
  errorType: string;
  errorMessage: string;
  status: string;
  severity: string;
  totalOccurrences: number;
  uniqueUsersAffected: number;
  errorEvents: ErrorEvent[];
  errorResolution?: ErrorResolution;
}>
```

#### getRecentErrors()

Query errors with filtering and pagination.

```typescript
static async getRecentErrors(
  organizationId: string,
  filters?: {
    status?: 'active' | 'resolved' | 'ignored';
    severity?: 'critical' | 'high' | 'medium' | 'low';
    environment?: string;
    limit?: number;
    offset?: number;
  }
): Promise<ErrorGroup[]>
```

#### startInvestigation()

Assign engineer and start investigation workflow.

```typescript
static async startInvestigation(errorGroupId: string, assignedToUserId: string)
```

**Example**:

```typescript
await ErrorTrackingService.startInvestigation('error-group-123', 'engineer-456');
// Now status is "investigating" and error is assigned
```

#### markResolved()

Resolve error with root cause and fix information.

```typescript
static async markResolved(
  errorGroupId: string,
  data: {
    rootCauseAnalysis: string;
    fixDescription: string;
    fixCommitHash?: string;
    fixReleaseVersion?: string;
  }
)
```

**Example**:

```typescript
await ErrorTrackingService.markResolved('error-group-123', {
  rootCauseAnalysis: 'User object not properly validated before processing',
  fixDescription: 'Added null check in getUserName() function',
  fixCommitHash: 'abc123def456',
  fixReleaseVersion: '2.1.1',
});
```

#### createAlertRule()

Define alert rule for error conditions.

```typescript
static async createAlertRule(params: {
  organizationId: string;
  name: string;
  description?: string;
  ruleType: string;                // error_rate, new_error, high_severity, user_impact
  conditions: any;                 // Rule-specific conditions
  notificationChannelIds: string[];
  escalationPolicyId?: string;
  createIncident?: boolean;
  createdBy: string;
}): Promise<string>
```

**Example - Alert on New Critical Errors**:

```typescript
const ruleId = await ErrorTrackingService.createAlertRule({
  organizationId: 'org-123',
  name: 'Critical Production Errors',
  ruleType: 'high_severity',
  conditions: {
    severity: ['critical'],
    environment: ['production'],
  },
  notificationChannelIds: ['channel-slack'],
  escalationPolicyId: 'policy-critical',
  createIncident: true,
  createdBy: 'admin-user',
});
```

#### evaluateAlertRules()

Evaluate and trigger applicable alert rules for error.

```typescript
static async evaluateAlertRules(errorGroupId: string): Promise<void>
```

#### createNotificationChannel()

Create multi-channel notification destination.

```typescript
static async createNotificationChannel(params: {
  organizationId: string;
  name: string;
  type: string;                    // email, slack, pagerduty, webhook, etc.
  config: any;
}): Promise<string>
```

**Examples**:

```typescript
// Slack
const slackChannel = await ErrorTrackingService.createNotificationChannel({
  organizationId: 'org-123',
  name: 'Engineering Alerts',
  type: 'slack',
  config: {
    webhookUrl: 'https://hooks.slack.com/services/...',
    channel: '#alerts',
  },
});

// PagerDuty
const pagerdutyChannel = await ErrorTrackingService.createNotificationChannel({
  organizationId: 'org-123',
  name: 'PagerDuty Enterprise',
  type: 'pagerduty',
  config: {
    integrationKey: 'abc123...',
    serviceId: 'service123',
  },
});

// Email
const emailChannel = await ErrorTrackingService.createNotificationChannel({
  organizationId: 'org-123',
  name: 'On-Call Engineers',
  type: 'email',
  config: {
    recipients: ['oncall@company.com'],
  },
});
```

#### createOnCallSchedule()

Set up on-call team roster.

```typescript
static async createOnCallSchedule(params: {
  organizationId: string;
  name: string;
  description?: string;
  timezone?: string;
  teamId?: string;
  scheduleType: 'daily' | 'weekly' | 'custom';
  rotationDetails: any;
}): Promise<string>
```

**Example**:

```typescript
const scheduleId = await ErrorTrackingService.createOnCallSchedule({
  organizationId: 'org-123',
  name: 'Engineering On-Call',
  timezone: 'America/New_York',
  teamId: 'team-engineering',
  scheduleType: 'weekly',
  rotationDetails: {
    type: 'weekly',
    daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    rotationPeriodDays: 7,
    layers: [
      {
        userIds: ['user-alice', 'user-bob', 'user-charlie', 'user-diana', 'user-eve'],
        startDate: '2024-01-01',
      },
    ],
  },
});
```

#### createEscalationPolicy()

Define multi-level escalation path.

```typescript
static async createEscalationPolicy(params: {
  organizationId: string;
  name: string;
  description?: string;
  levels: Array<{
    level: number;
    delayMinutes: number;
    notificationChannelIds: string[];
    onCallScheduleIds?: string[];
  }>;
  createdBy: string;
}): Promise<string>
```

**Example**:

```typescript
const policyId = await ErrorTrackingService.createEscalationPolicy({
  organizationId: 'org-123',
  name: 'Critical Alert Escalation',
  levels: [
    {
      level: 1,
      delayMinutes: 0,
      notificationChannelIds: ['channel-slack'],  // Immediate Slack
    },
    {
      level: 2,
      delayMinutes: 5,
      notificationChannelIds: ['channel-pagerduty'],  // PagerDuty after 5 min
      onCallScheduleIds: ['schedule-on-call'],  // To current on-call
    },
    {
      level: 3,
      delayMinutes: 15,
      notificationChannelIds: ['channel-email'],  // Email team after 15 min
    },
  ],
  createdBy: 'admin-user',
});
```

#### escalateAlert()

Manually escalate alert through escalation policy.

```typescript
static async escalateAlert(notificationId: string, escalationPolicyId: string): Promise<void>
```

---

## API Endpoints

Base URL: `/api/errors`

### GET Endpoints

#### List Errors

```
GET /api/errors?action=list&organizationId={orgId}&status={status}&severity={severity}
```

**Parameters**:
- `organizationId`: Tenant ID (required)
- `status`: active, resolved, ignored (optional)
- `severity`: critical, high, medium, low (optional)
- `environment`: production, staging, etc (optional)
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)

**Response**:

```json
{
  "errors": [
    {
      "id": "group-1",
      "errorType": "TypeError",
      "errorMessage": "Cannot read property",
      "status": "active",
      "severity": "high",
      "totalOccurrences": 47,
      "uniqueUsersAffected": 12,
      "lastOccurredAt": "2024-01-15T14:32:00Z"
    }
  ],
  "count": 12
}
```

#### Get Error Group

```
GET /api/errors?action=group&errorGroupId={groupId}
```

**Response**:

```json
{
  "errorGroup": {
    "id": "group-1",
    "errorFingerprint": "sha256...",
    "errorType": "TypeError",
    "errorMessage": "Cannot read property 'name' of undefined",
    "status": "active",
    "severity": "high",
    "totalOccurrences": 47,
    "uniqueUsersAffected": 12,
    "firstOccurredAt": "2024-01-10T08:15:00Z",
    "lastOccurredAt": "2024-01-15T14:32:00Z",
    "errorEvents": [...],
    "errorResolution": {...}
  }
}
```

### POST Endpoints

#### Record Error

```
POST /api/errors
{
  "action": "record-error",
  "organizationId": "org-123",
  "errorType": "TypeError",
  "errorMessage": "Cannot read property",
  "stackTrace": "...",
  "context": { ... },
  "breadcrumbs": [ ... ],
  "environment": "production",
  "releaseVersion": "2.1.0"
}
```

#### Start Investigation

```
POST /api/errors
{
  "action": "investigate",
  "errorGroupId": "group-1"
}
```

#### Resolve Error

```
POST /api/errors
{
  "action": "resolve",
  "errorGroupId": "group-1",
  "rootCauseAnalysis": "...",
  "fixDescription": "...",
  "fixCommitHash": "abc123",
  "fixReleaseVersion": "2.1.1"
}
```

#### Create Alert Rule

```
POST /api/errors
{
  "action": "create-alert-rule",
  "organizationId": "org-123",
  "name": "Critical Errors",
  "ruleType": "high_severity",
  "conditions": { "severity": ["critical"] },
  "notificationChannelIds": ["channel-1"]
}
```

#### Create Notification Channel

```
POST /api/errors
{
  "action": "create-notification-channel",
  "organizationId": "org-123",
  "name": "Slack Engineering",
  "type": "slack",
  "config": { "webhookUrl": "...", "channel": "#alerts" }
}
```

#### Create On-Call Schedule

```
POST /api/errors
{
  "action": "create-on-call-schedule",
  "organizationId": "org-123",
  "name": "Engineering On-Call",
  "scheduleType": "weekly",
  "rotationDetails": { ... }
}
```

#### Create Escalation Policy

```
POST /api/errors
{
  "action": "create-escalation-policy",
  "organizationId": "org-123",
  "name": "Critical Escalation",
  "levels": [ ... ]
}
```

---

## Usage Examples

### Complete Error Monitoring Setup

```typescript
// 1. Create notification channels
const slackChannel = await ErrorTrackingService.createNotificationChannel({
  organizationId: 'org-123',
  name: 'Engineering Alerts',
  type: 'slack',
  config: { webhookUrl, channel: '#alerts' },
});

const pagerduty = await ErrorTrackingService.createNotificationChannel({
  organizationId: 'org-123',
  name: 'PagerDuty',
  type: 'pagerduty',
  config: { integrationKey, serviceId },
});

// 2. Create on-call schedule
const schedule = await ErrorTrackingService.createOnCallSchedule({
  organizationId: 'org-123',
  name: 'Engineering On-Call',
  scheduleType: 'weekly',
  rotationDetails: {
    layers: [{ userIds: ['user-1', 'user-2'], startDate: '2024-01-01' }],
  },
});

// 3. Create escalation policy
const policy = await ErrorTrackingService.createEscalationPolicy({
  organizationId: 'org-123',
  name: 'Critical Escalation',
  levels: [
    { level: 1, delayMinutes: 0, notificationChannelIds: [slackChannel] },
    {
      level: 2,
      delayMinutes: 5,
      notificationChannelIds: [pagerduty],
      onCallScheduleIds: [schedule],
    },
  ],
  createdBy: 'admin-user',
});

// 4. Create alert rules
const criticalRule = await ErrorTrackingService.createAlertRule({
  organizationId: 'org-123',
  name: 'Critical Production Errors',
  ruleType: 'high_severity',
  conditions: { severity: ['critical'], environment: ['production'] },
  notificationChannelIds: [slackChannel],
  escalationPolicyId: policy,
  createIncident: true,
  createdBy: 'admin-user',
});

// 5. In your client SDK, capture and record errors
const errorResult = await ErrorTrackingService.recordError({
  organizationId: 'org-123',
  errorType: 'TypeError',
  errorMessage: 'Cannot read property of undefined',
  stackTrace: '...',
  context: { userId: 'user-456', ...others },
  breadcrumbs: [...],
});

// Alert rules are automatically evaluated
```

### Client-Side Error Capture

```javascript
// In your frontend application
import { ErrorCapture } from 'error-capture-sdk';

const errorCapture = new ErrorCapture({
  organizationId: 'org-123',
  apiUrl: 'https://api.example.com',
});

// Automatically capture unhandled errors
window.addEventListener('error', (event) => {
  errorCapture.capture({
    errorType: event.error.name,
    errorMessage: event.error.message,
    stackTrace: event.error.stack,
    context: {
      url: window.location.href,
      userAgent: navigator.userAgent,
    },
    breadcrumbs: errorCapture.getBreadcrumbs(),
  });
});

// Manual capture
try {
  riskyOperation();
} catch (error) {
  errorCapture.capture(error);
}
```

### Error Resolution Workflow

```typescript
// Engineer sees error in dashboard
const errorGroup = await ErrorTrackingService.getErrorGroup('group-1');

// Start investigation
await ErrorTrackingService.startInvestigation('group-1', engineerId);

// Analyze
console.log(errorGroup.errorEvents); // Review all occurrences
console.log(errorGroup.errorEvents[0].breadcrumbs); // User journey

// Fix and resolve
await ErrorTrackingService.markResolved('group-1', {
  rootCauseAnalysis: 'Missing null check on user object',
  fixDescription: 'Added validation in getUserName() at line 45',
  fixCommitHash: 'abc123def456',
  fixReleaseVersion: '2.1.1',
});

// System automatically sends resolution notification
```

---

## Best Practices

### 1. Comprehensive Context Capture

```typescript
const errorResult = await ErrorTrackingService.recordError({
  organizationId,
  errorType: error.name,
  errorMessage: error.message,
  stackTrace: error.stack,
  context: {
    userId: user.id,
    sessionId: session.id,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date(),
    // Custom context
    customerId: customer.id,
    operationType: 'checkout_flow',
  },
  breadcrumbs: [
    {
      category: 'ui',
      level: 'info',
      message: 'User clicked checkout',
      data: { timestamp: Date.now() },
    },
  ],
});
```

### 2. Source Map Integration

```typescript
// Upload source maps with releases
await uploadSourceMap({
  releaseVersion: '2.1.0',
  environment: 'production',
  sourceMapUrl: 'dist/app-2.1.0.js.map',
  minifiedFilePath: 'dist/app-2.1.0.js',
});

// Errors will automatically be mapped to source code
```

### 3. Alert Rule Hierarchy

```typescript
// Critical errors -> Immediate notification
await ErrorTrackingService.createAlertRule({
  ruleType: 'high_severity',
  name: 'Critical Errors',
  conditions: { severity: ['critical'], environment: ['production'] },
  notificationChannelIds: [slackChannel, pagerduty],
  escalationPolicyId: criticalPolicy,
});

// High-impact errors -> Team notification
await ErrorTrackingService.createAlertRule({
  ruleType: 'user_impact',
  name: 'High Impact Errors',
  conditions: { affectedUsersThreshold: 10 },
  notificationChannelIds: [slackChannel],
});
```

### 4. On-Call Schedule Verification

```typescript
// Verify current on-call
const oncallUserId = await ErrorTrackingService.getCurrentOnCallUser(scheduleId);

// Route critical alerts appropriately
if (oncallUserId) {
  // Send to current on-call engineer
} else {
  // Fall back to team notification
}
```

### 5. Error Categorization

```typescript
// Tag errors for organization
await ErrorTrackingService.tagError('group-1', ['database', 'high-priority']);

// Filter and query by tags
const databaseErrors = await ErrorTrackingService.getRecentErrors(org, {
  tags: ['database'],
});
```

---

## Integration Guide

### Step 1: Set Up Notification Channels

```typescript
// Email
const emailChannel = await ErrorTrackingService.createNotificationChannel({
  organizationId: org,
  name: 'Team Email',
  type: 'email',
  config: { recipients: ['team@company.com'] },
});

// Slack
const slackChannel = await ErrorTrackingService.createNotificationChannel({
  organizationId: org,
  name: 'Engineering',
  type: 'slack',
  config: { webhookUrl: process.env.SLACK_WEBHOOK },
});
```

### Step 2: Configure Alert Rules

```typescript
await ErrorTrackingService.createAlertRule({
  organizationId: org,
  name: 'Production Errors',
  ruleType: 'high_severity',
  conditions: { severity: ['critical', 'high'], environment: ['production'] },
  notificationChannelIds: [slackChannel],
  createdBy: userId,
});
```

### Step 3: Set Up On-Call Coverage

```typescript
const schedule = await ErrorTrackingService.createOnCallSchedule({
  organizationId: org,
  name: 'Engineering On-Call',
  scheduleType: 'weekly',
  rotationDetails: { ... },
});
```

### Step 4: Create Escalation Policy

```typescript
const policy = await ErrorTrackingService.createEscalationPolicy({
  organizationId: org,
  name: 'Standard Escalation',
  levels: [
    { level: 1, delayMinutes: 0, notificationChannelIds: [slackChannel] },
    { level: 2, delayMinutes: 10, notificationChannelIds: [pagerduty] },
  ],
  createdBy: userId,
});
```

### Step 5: Initialize Client SDK

```typescript
// In your frontend
const errorCapture = new ErrorCapture({
  organizationId: 'org-123',
  apiUrl: 'https://api.example.com',
});

// Errors automatically capture context and breadcrumbs
```

---

## Roadmap

### Phase 4.3 Complete (Current)

✅ Error Fingerprinting & Grouping
✅ Stack Trace Parsing
✅ Error Context Capture (User, Browser, Device, Network)
✅ Breadcrumb Trail Tracking
✅ Alert Rules with Multi-Conditions
✅ Multi-Channel Notifications (Email, Slack, PagerDuty, Teams, Discord, Webhook)
✅ On-Call Schedule Management
✅ Multi-Level Escalation Policies
✅ Error Resolution Workflow

### Phase 4.4: Usage Analytics & Insights

- Funnel analysis for user flows
- Cohort tracking and retention
- Feature adoption metrics
- User segmentation

### Phase 4.5: Cost Analytics & Optimization

- Per-service cost breakdown
- Cost forecasting
- Resource waste detection
- Reserved capacity optimization

---

## Support & Questions

For implementation questions or issues:

1. Review database schema definitions
2. Check service method documentation
3. Review API endpoint examples
4. See usage examples for common patterns
5. Consult best practices section

Last Updated: January 2024
Phase: 4.3 - Error Tracking & Advanced Alerting
Status: Complete
