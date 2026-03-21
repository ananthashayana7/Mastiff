# Usage Analytics & Insights - Phase 4.4

Comprehensive funnel analysis, cohort tracking, feature adoption metrics, user segmentation, and behavioral insights system for the Mastiff platform.

**Executive Summary**: Usage Analytics transforms raw usage events into strategic insights for product optimization, retention, and growth. It enables data-driven feature prioritization, user segmentation for targeted outreach, and identification of friction points in critical flows.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Service Layer](#service-layer)
4. [API Endpoints](#api-endpoints)
5. [Usage Examples](#usage-examples)
6. [Best Practices](#best-practices)
7. [Analysis Patterns](#analysis-patterns)
8. [Metrics Catalog](#metrics-catalog)
9. [Roadmap](#roadmap)

---

## Architecture Overview

### Core Components

**Usage Analytics Stack**:

```
Client Applications (Events)
    ↓ (record-event)
API Routes (/api/usage)
    ↓
UsageAnalyticsService
    ├── Event Recording
    │   └── Funnel Tracking
    │
    ├── Funnel Analysis
    │   ├── Conversion Rates
    │   ├── Dropoff Analysis
    │   └── Time-to-Conversion
    │
    ├── Cohort Analysis
    │   ├── Retention Matrix
    │   ├── Churn Tracking
    │   └── Cohort Comparison
    │
    ├── Feature Adoption
    │   ├── Adoption Rate
    │   ├── Usage Intensity
    │   └── Time-to-Adoption
    │
    ├── User Segmentation
    │   ├── Power Users
    │   ├── At-Risk Users
    │   └── Custom Segments
    │
    ├── Session Tracking
    │   ├── Duration
    │   ├── Source Attribution
    │   └── Goal Completion
    │
    ├── Behavior Analysis
    │   ├── Pattern Detection
    │   ├── Engagement Scoring
    │   └── Churn Prediction
    │
    └── Growth Metrics
        ├── DAU/MAU
        ├── Retention Curves
        └── MRR Tracking
    ↓
Usage Analytics Database Schema
    ├── usage_events (Raw event stream)
    ├── conversion_funnels (Funnel definitions)
    ├── funnelEvents (Individual funnel progress)
    ├── cohorts (User cohorts)
    ├── cohortAnalysis (Retention & metrics)
    ├── featureAdoption (Feature metrics)
    ├── userSegments (User groups)
    ├── userSessions (Session tracking)
    ├── userBehaviorPatterns (Pattern detection)
    ├── eventHeatmaps (Activity patterns)
    └── growthMetrics (Growth tracking)
    ↓
Phase 4.1 Observability & Phase 4.3 Error Tracking
    └── Correlation with errors, performance
```

### Key Features

| Feature | Purpose | Use Case |
|---------|---------|----------|
| **Event Recording** | Capture user interactions | Track feature usage |
| **Funnel Analysis** | Measure step completion | Identify signup/checkout friction |
| **Cohort Analysis** | Track user groups over time | Retention vs new vs old users |
| **Feature Adoption** | Monitor feature uptake | Measure feature success |
| **User Segmentation** | Group users by behavior | Targeted campaigns & engagement |
| **Session Tracking** | Understand user sessions | Attribution, intent, bounce rate |
| **Behavior Patterns** | Detect user types | Power users, at-risk, new users |
| **Event Heatmaps** | Visualize activity patterns | Optimal timing, feature usage |
| **Growth Metrics** | Track product health | DAU, retention, churn |

---

## Database Schema

### usage_events

Raw event stream capturing all user interactions.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID
  workspaceId?: string;            // Optional workspace scope
  
  // User and session
  userId: string;                  // User performing action
  sessionId: string;               // Session ID for grouping
  
  // Event classification
  eventName: string;               // user_signup, notebook_created, chart_viewed, etc
  eventCategory: string;           // engagement, feature_usage, ux_interaction, conversion
  
  // Event metadata
  eventData: {                      // Custom properties
    [key: string]: any;
  };
  
  // Context
  properties: {                     // Device, browser, OS, region
    deviceType?: string;
    browser?: string;
    os?: string;
    region?: string;
  };
  context: {                        // Page, referrer, timestamp
    url?: string;
    referrer?: string;
    timestamp: Date;
  };
  
  timestamp: Date;
  isConversion: boolean;           // Part of conversion funnel
  conversionFunnelId?: string;     // Which funnel this belongs to
  
  createdAt: Date;
}
```

### conversionFunnels

Funnel definitions for tracking multi-step flows.

```typescript
{
  id: string;
  organizationId: string;
  
  // Definition
  name: string;                    // "Signup Flow", "Checkout Flow"
  description: string;
  
  // Ordered steps
  steps: Array<{
    step: number;
    eventName: string;             // Which event marks this step
  }>;
  
  // Aggregate metrics
  totalUsers: number;              // Users who entered funnel
  totalConversions: number;        // Users who completed all steps
  conversionRate: number;          // %
  
  // Step-by-step breakdown
  stepMetrics: {
    [step: string]: {
      users: number;
      eventName: string;
    };
  };
  
  // Dropoff analysis
  dropoffRates: {
    [transition: string]: number;  // % drop from step X to Y
  };
  
  // Time analysis
  avgTimeToConversionSeconds: number;
  medianTimeToConversionSeconds: number;
  
  // Date range
  analysisStartDate: Date;
  analysisEndDate: Date;
  
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### funnelEvents

Individual user progression through funnel steps.

```typescript
{
  id: string;
  conversionFunnelId: string;
  usageEventId: string;
  organizationId: string;
  
  // User journey
  userId: string;
  sessionId: string;
  
  // Step tracking
  stepNumber: number;              // Which step in funnel
  eventName: string;               // Event that triggered this step
  
  // Timeline
  timestamp: Date;
  sessionEnteredAt: Date;          // When user entered funnel
  
  // Completion status
  completedFunnel: boolean;        // Did they complete all steps?
  abandonedAt?: Date;              // When did they abandon?
  completedAt?: Date;              // When did they complete?
  
  createdAt: Date;
}
```

### cohorts

User cohorts for comparison and retention analysis.

```typescript
{
  id: string;
  organizationId: string;
  
  // Definition
  name: string;                    // "Signup Jan 2024", "Premium Users"
  cohortType: string;              // acquisition, behavioral, demographic
  
  // Criteria for membership
  criteria: {
    acquisitionDate?: { from: Date, to: Date };
    features?: string[];           // Required features
    userProperties?: object;      // Property conditions
    minimumActivity?: {
      events: number;
      days: number;
    };
  };
  
  // Membership
  memberCount: number;
  members: string[];               // User IDs
  
  // Tracking
  isAutomated: boolean;            // Auto-updated?
  sizeHistory: {
    [date: string]: number;        // Size over time
  };
  
  createdAt: Date;
  updatedAt: Date;
}
```

### cohortAnalysis

Retention and engagement metrics for cohorts.

```typescript
{
  id: string;
  cohortId: string;
  organizationId: string;
  
  // Retention matrix (cohort table)
  retentionMatrix: {
    [cohortWeek: string]: {
      [nWeeks: number]: number;    // % retention at N weeks
    };
  };
  // Example: { "week_0": { 0: 100.0, 1: 85.5, 2: 72.3 } }
  
  // Retention metrics
  avgRetention1Week: number;       // %
  avgRetention2Week: number;
  avgRetention4Week: number;
  
  // Churn
  churnRate: number;               // % per period
  avgLifespanDays: number;         // Average user lifespan
  
  // Feature adoption within cohort
  featureAdoption: {
    [feature: string]: number;     // % adoption rate
  };
  
  // Engagement
  avgEventsPerUser: number;
  activeUserPercentage: number;
  
  // Value
  avgLifetimeValue: number;        // $
  revenuePerUser: number;
  
  analysisDate: Date;
  createdAt: Date;
}
```

### featureAdoption

Feature-specific adoption and usage metrics.

```typescript
{
  id: string;
  organizationId: string;
  
  // Feature identification
  featureName: string;
  featureCategory: string;         // AI, notebook, collaboration, etc
  releaseVersion: string;
  releaseDate: Date;
  
  // Adoption metrics
  totalUsersExposed: number;       // Saw the feature
  adoptingUsers: number;           // Used the feature at least once
  adoptionRate: number;            // % of exposed
  
  // Time to adoption
  avgDaysToFirstUse: number;
  medianDaysToFirstUse: number;
  
  // Usage intensity
  avgUsageFrequencyPerWeek: number;
  powerUserPercentage: number;     // Heavy users
  dormantUserPercentage: number;   // Never/rarely used
  
  // Recent activity
  activeUsersLastWeek: number;
  churnedUsers: number;
  
  // Sentiment & impact
  userSentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  impactScore: number;             // 0-100
  
  isLaunched: boolean;
  isBeta: boolean;
  
  analysisDate: Date;
  createdAt: Date;
}
```

### userSegments

User groups for targeted analysis and outreach.

```typescript
{
  id: string;
  organizationId: string;
  
  // Segment definition
  name: string;                    // "Power Users", "At-Risk", "Trial"
  
  // Criteria
  criteria: {
    eventsPerMonth?: { min?: number, max?: number };
    activeLastDays?: number;
    accountAge?: { min?: number, max?: number };
    features?: string[];
    pricingTier?: string;
    region?: string;
    customProperties?: object;
  };
  
  // Membership
  userCount: number;
  userIds: string[];
  
  // Metrics
  avgSessionsPerMonth: number;
  avgEventsPerSession: number;
  avgSessionDurationMinutes: number;
  
  // Value
  avgMonthlyCost: number;
  churnRisk: number;               // 0-100 score
  
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### userSessions

Detailed session tracking with source attribution.

```typescript
{
  id: string;
  organizationId: string;
  userId: string;
  
  // Timing
  sessionStartedAt: Date;
  sessionEndedAt?: Date;
  durationSeconds: number;
  
  // Device & Environment
  deviceType: string;              // mobile, tablet, desktop
  osName: string;
  browserName: string;
  
  // Location
  country: string;
  region: string;
  city: string;
  
  // Activity
  eventCount: number;
  pageViews: number;
  interactions: {
    clicks: number;
    formSubmits: number;
    scrolls: number;
  };
  
  // Attribution
  referrer: string;
  source: string;                  // organic, paid, direct, referral
  medium: string;                  // cpc, email, social, etc
  campaignId: string;
  
  // Goals
  goalCompleted: boolean;
  conversionValue?: number;
  
  createdAt: Date;
}
```

### userBehaviorPatterns

Detected behavior patterns and churn risk.

```typescript
{
  id: string;
  organizationId: string;
  userId: string;
  
  // Pattern classification
  patternType: string;
  // power_user, casual_user, dormant_user, at_risk, new_user, churned
  
  // Characteristics
  avgSessionsPerWeek: number;
  avgSessionDurationMinutes: number;
  favoriteFeaturesUsed: string[];
  
  // Time preferences
  peakActivityHour: number;        // 0-23
  peakActivityDay: string;         // day of week
  
  // Goals
  goalProgressPercentage: number;
  lastActiveAt: Date;
  daysInactive: number;
  
  // Risk indicators
  engagementTrend: string;         // increasing, stable, decreasing
  churnProbability: number;        // 0-100
  
  analysisDate: Date;
  createdAt: Date;
}
```

### eventHeatmaps

Activity patterns by dimension (time, segment, geography).

```typescript
{
  id: string;
  organizationId: string;
  
  // Definition
  eventName: string;
  dimension: string;               // hour_of_day, day_of_week, user_segment, geo
  
  // Heatmap data
  heatmapData: {
    [label: string]: {
      [bucket: string]: number;    // Count/frequency
    };
  };
  // Example: { "monday": { "00": 45, "01": 23 }, "tuesday": {...} }
  
  // Peak identification
  peakValue: number;
  peakLabel: string;               // e.g., "friday_18"
  
  avgValue: number;
  totalEvents: number;
  
  analysisDate: Date;
  createdAt: Date;
}
```

### growthMetrics

Key product health and growth metrics.

```typescript
{
  id: string;
  organizationId: string;
  
  // Period
  periodDate: Date;
  periodType: string;              // daily, weekly, monthly
  
  // User metrics
  newUsers: number;
  returningUsers: number;
  activeUsers: number;             // DAU or MAU
  totalUsers: number;
  churnedUsers: number;
  
  // Growth rates
  weekOverWeekGrowth: number;
  monthOverMonthGrowth: number;
  
  // Engagement
  avgEventsPerUser: number;
  sessions: number;
  avgSessionDurationMinutes: number;
  
  // Viral
  invitesSent: number;
  invitesAccepted: number;
  referralConversions: number;
  
  // Retention curves
  dayOneRetention: number;         // %
  day7Retention: number;
  day30Retention: number;
  
  // Revenue
  monthlyRecurringRevenue: number;
  customerLifetimeValue: number;
  
  createdAt: Date;
}
```

---

## Service Layer

### UsageAnalyticsService

Complete implementation for usage analysis and insights.

#### recordEvent()

Record a user interaction event.

```typescript
static async recordEvent(params: {
  organizationId: string;
  workspaceId?: string;
  userId: string;
  sessionId: string;
  eventName: string;
  eventCategory: string;
  eventData?: any;
  properties?: any;
  context?: any;
}): Promise<string>
```

**Example**:

```typescript
const eventId = await UsageAnalyticsService.recordEvent({
  organizationId: 'org-123',
  userId: 'user-456',
  sessionId: 'sess-789',
  eventName: 'notebook_created',
  eventCategory: 'feature_usage',
  eventData: {
    notebookId: 'nb-123',
    title: 'Analysis Report',
    template: 'data_exploration',
  },
  properties: {
    deviceType: 'desktop',
    browser: 'Chrome',
  },
  context: {
    url: 'https://app.mastiff.io/notebooks/new',
    referrer: 'dashboard',
  },
});
```

#### createConversionFunnel()

Define a multi-step funnel to track.

```typescript
static async createConversionFunnel(params: {
  organizationId: string;
  name: string;
  description?: string;
  steps: Array<{ step: number; eventName: string }>;
  analysisStartDate: Date;
  analysisEndDate: Date;
}): Promise<string>
```

**Example - Signup Funnel**:

```typescript
const funnelId = await UsageAnalyticsService.createConversionFunnel({
  organizationId: 'org-123',
  name: 'Signup Flow',
  description: 'Track users from landing page to creating first notebook',
  steps: [
    { step: 1, eventName: 'landing_page_viewed' },
    { step: 2, eventName: 'signup_form_opened' },
    { step: 3, eventName: 'signup_email_verified' },
    { step: 4, eventName: 'first_notebook_created' },
  ],
  analysisStartDate: new Date('2024-01-01'),
  analysisEndDate: new Date('2024-01-31'),
});
```

#### analyzeFunnel()

Calculate conversion rates, dropoff, and metrics.

```typescript
static async analyzeFunnel(funnelId: string): Promise<{
  totalUsers: number;
  totalConversions: number;
  conversionRate: number;
  stepMetrics: Record<string, any>;
  dropoffRates: Record<string, number>;
  avgTimeToConversion: number;
}>
```

**Response**:

```typescript
{
  totalUsers: 1250,
  totalConversions: 450,
  conversionRate: 36.0,
  stepMetrics: {
    step_1: { users: 1250, eventName: 'landing_page_viewed' },
    step_2: { users: 950, eventName: 'signup_form_opened' },
    step_3: { users: 850, eventName: 'signup_email_verified' },
    step_4: { users: 450, eventName: 'first_notebook_created' },
  },
  dropoffRates: {
    'step_1_to_2': 24.0,    // 24% drop
    'step_2_to_3': 10.5,    // 10.5% drop
    'step_3_to_4': 47.1,    // 47.1% drop (biggest!)
  },
  avgTimeToConversion: 3600, // 1 hour
}
```

#### createCohort()

Create a user cohort based on criteria.

```typescript
static async createCohort(params: {
  organizationId: string;
  name: string;
  description?: string;
  cohortType: string;              // acquisition, behavioral, demographic
  criteria: any;
  isAutomated?: boolean;
}): Promise<string>
```

**Examples**:

```typescript
// Acquisition cohort: Users who signed up in January
const jan2024Cohort = await UsageAnalyticsService.createCohort({
  organizationId: 'org-123',
  name: 'Signup January 2024',
  cohortType: 'acquisition',
  criteria: {
    acquisitionDate: {
      from: new Date('2024-01-01'),
      to: new Date('2024-01-31'),
    },
  },
});

// Behavioral cohort: Power users
const powerUsersCohort = await UsageAnalyticsService.createCohort({
  organizationId: 'org-123',
  name: 'Power Users',
  cohortType: 'behavioral',
  criteria: {
    minimumActivity: { events: 100, days: 30 },
    features: ['notebook', 'chat', 'collaboration'],
  },
  isAutomated: true,
});
```

#### analyzeCohort()

Calculate retention, engagement, and value metrics.

```typescript
static async analyzeCohort(cohortId: string): Promise<{
  retentionMatrix: Record<string, Record<number, number>>;
  avgRetention1Week: number;
  avgRetention2Week: number;
  avgRetention4Week: number;
  churnRate: number;
  avgLifespanDays: number;
}>
```

#### trackFeatureAdoption()

Monitor adoption metrics for a feature.

```typescript
static async trackFeatureAdoption(params: {
  organizationId: string;
  featureName: string;
  featureCategory?: string;
  releaseVersion?: string;
  releaseDate?: Date;
}): Promise<string>
```

**Example**:

```typescript
await UsageAnalyticsService.trackFeatureAdoption({
  organizationId: 'org-123',
  featureName: 'Collaborative Editing',
  featureCategory: 'collaboration',
  releaseVersion: '2.1.0',
  releaseDate: new Date('2024-01-15'),
});
```

#### createUserSegment()

Define a user segment.

```typescript
static async createUserSegment(params: {
  organizationId: string;
  name: string;
  description?: string;
  criteria: any;
}): Promise<string>
```

#### startSession() / endSession()

Track user sessions.

```typescript
// Start
const sessionId = await UsageAnalyticsService.startSession({
  organizationId: 'org-123',
  userId: 'user-456',
  deviceType: 'desktop',
  source: 'organic',
  referrer: 'google.com',
});

// End
const durationSeconds = await UsageAnalyticsService.endSession(
  sessionId,
  true // goal completed?
);
```

#### detectBehaviorPatterns()

Automatically detect user behavior type and risk.

```typescript
static async detectBehaviorPatterns(
  userId: string,
  organizationId: string
): Promise<{
  patternType: string;
  sessionsPerWeek: number;
  avgSessionDuration: number;
  peakActivityHour: number;
}>
```

#### buildEventHeatmap()

Create heatmap showing activity patterns.

```typescript
static async buildEventHeatmap(
  organizationId: string,
  eventName: string,
  dimension: string  // hour_of_day, day_of_week, user_segment
): Promise<string>
```

#### recordGrowthMetrics()

Record key growth metrics.

```typescript
static async recordGrowthMetrics(params: {
  organizationId: string;
  periodDate: Date;
  periodType: string;
  newUsers: number;
  returningUsers: number;
  activeUsers: number;
  totalUsers: number;
  churnedUsers: number;
  sessions: number;
  avgEventsPerUser: number;
  avgSessionDurationMinutes: number;
  dayOneRetention?: number;
  day7Retention?: number;
  day30Retention?: number;
  monthlyRecurringRevenue?: number;
}): Promise<string>
```

#### getUsageDashboard()

Get comprehensive dashboard with all metrics.

```typescript
static async getUsageDashboard(organizationId: string): Promise<{
  currentMetrics: GrowthMetrics;
  topFeatures: FeatureAdoption[];
  userSegments: UserSegment[];
  growthTrends: GrowthMetrics[];
}>
```

---

## API Endpoints

Base URL: `/api/usage`

### GET Endpoints

#### Get Usage Dashboard

```
GET /api/usage?action=dashboard&organizationId={orgId}
```

**Response**:

```json
{
  "dashboard": {
    "currentMetrics": {
      "newUsers": 150,
      "activeUsers": 3500,
      "avgEventsPerUser": 25.3,
      "day30Retention": 65.5
    },
    "topFeatures": [...],
    "userSegments": [...],
    "growthTrends": [...]
  }
}
```

#### Get Funnel Report

```
GET /api/usage?action=funnel&funnelId={funnelId}
```

#### Get Feature Adoption Trends

```
GET /api/usage?action=features&organizationId={orgId}
```

#### Get User Segments

```
GET /api/usage?action=segments&organizationId={orgId}
```

#### Get Growth Trends

```
GET /api/usage?action=growth&organizationId={orgId}&periods=12
```

### POST Endpoints

#### Record Event

```
POST /api/usage
{
  "action": "record-event",
  "organizationId": "org-123",
  "userId": "user-456",
  "sessionId": "sess-789",
  "eventName": "notebook_created",
  "eventCategory": "feature_usage",
  "eventData": { ... }
}
```

#### Create Funnel

```
POST /api/usage
{
  "action": "create-funnel",
  "organizationId": "org-123",
  "name": "Signup Flow",
  "steps": [
    { "step": 1, "eventName": "landing_page_viewed" },
    { "step": 2, "eventName": "signup_form_opened" },
    { "step": 3, "eventName": "account_created" }
  ],
  "analysisStartDate": "2024-01-01",
  "analysisEndDate": "2024-01-31"
}
```

#### Analyze Funnel

```
POST /api/usage
{
  "action": "analyze-funnel",
  "funnelId": "funnel-123"
}
```

#### Create Cohort

```
POST /api/usage
{
  "action": "create-cohort",
  "organizationId": "org-123",
  "name": "Signup Jan 2024",
  "cohortType": "acquisition",
  "criteria": {
    "acquisitionDate": {
      "from": "2024-01-01",
      "to": "2024-01-31"
    }
  }
}
```

#### Analyze Cohort

```
POST /api/usage
{
  "action": "analyze-cohort",
  "cohortId": "cohort-123"
}
```

#### Track Feature Adoption

```
POST /api/usage
{
  "action": "track-feature",
  "organizationId": "org-123",
  "featureName": "Collaborative Editing",
  "releaseVersion": "2.1.0",
  "releaseDate": "2024-01-15"
}
```

#### Create User Segment

```
POST /api/usage
{
  "action": "create-segment",
  "organizationId": "org-123",
  "name": "Power Users",
  "criteria": {
    "eventsPerMonth": { "min": 100 },
    "features": ["notebook", "chat"]
  }
}
```

#### Record Growth Metrics

```
POST /api/usage
{
  "action": "record-growth",
  "organizationId": "org-123",
  "periodDate": "2024-01-15",
  "periodType": "daily",
  "newUsers": 150,
  "activeUsers": 3500,
  "avgEventsPerUser": 25.3,
  "day30Retention": 65.5
}
```

---

## Usage Examples

### Complete Analytics Implementation

```typescript
// 1. Record events as users interact
const eventId = await UsageAnalyticsService.recordEvent({
  organizationId: 'org-123',
  userId: user.id,
  sessionId: sessionId,
  eventName: 'notebook_created',
  eventCategory: 'feature_usage',
  eventData: { notebookId: nb.id, template: 'analysis' },
});

// 2. Define funnels to track
const funnelId = await UsageAnalyticsService.createConversionFunnel({
  organizationId: 'org-123',
  name: 'Notebook Creation Flow',
  steps: [
    { step: 1, eventName: 'notebooks_page_viewed' },
    { step: 2, eventName: 'create_notebook_clicked' },
    { step: 3, eventName: 'notebook_created' },
  ],
  analysisStartDate: new Date('2024-01-01'),
  analysisEndDate: new Date('2024-01-31'),
});

// 3. Analyze funnel completion
const analysis = await UsageAnalyticsService.analyzeFunnel(funnelId);
// Output: 36% conversion, 24% drop at step 2

// 4. Create cohorts to compare
const signupCohort = await UsageAnalyticsService.createCohort({
  organizationId: 'org-123',
  name: 'Jan 2024 Signups',
  cohortType: 'acquisition',
  criteria: {
    acquisitionDate: { from: new Date('2024-01-01'), to: new Date('2024-01-31') },
  },
});

// 5. Track adoption of new features
await UsageAnalyticsService.trackFeatureAdoption({
  organizationId: 'org-123',
  featureName: 'Real-time Collaboration',
  releaseVersion: '2.1.0',
  releaseDate: new Date('2024-01-15'),
});

// 6. Segment users for targeted outreach
const powerUsers = await UsageAnalyticsService.createUserSegment({
  organizationId: 'org-123',
  name: 'Power Users',
  criteria: {
    minimumActivity: { events: 100, days: 30 },
    features: ['notebook', 'chat'],
  },
});

// 7. Track sessions
const sessionId = await UsageAnalyticsService.startSession({
  organizationId: 'org-123',
  userId: 'user-456',
  source: 'organic',
  referrer: 'google.com',
});
// ... user activity ...
const duration = await UsageAnalyticsService.endSession(sessionId, true);

// 8. Get comprehensive dashboard
const dashboard = await UsageAnalyticsService.getUsageDashboard('org-123');
```

### Behavioral Analytics

```typescript
// Detect if user is at risk
const patterns = await UsageAnalyticsService.detectBehaviorPatterns(
  'user-456',
  'org-123'
);

if (patterns.patternType === 'dormant_user') {
  // Send re-engagement email
  await sendReEngagementEmail(user.email);
} else if (patterns.patternType === 'power_user') {
  // Offer premium features
  await offerPremiumUpgrade(user.id);
}
```

### Growth Metrics Tracking

```typescript
// Daily metrics collection
const metricsId = await UsageAnalyticsService.recordGrowthMetrics({
  organizationId: 'org-123',
  periodDate: new Date(),
  periodType: 'daily',
  newUsers: 150,
  returningUsers: 2800,
  activeUsers: 2950,
  totalUsers: 35000,
  churnedUsers: 75,
  sessions: 12500,
  avgEventsPerUser: 24.5,
  avgSessionDurationMinutes: 12.3,
  dayOneRetention: 72.5,
  day7Retention: 65.2,
  day30Retention: 48.3,
});

// Get trends
const trends = await UsageAnalyticsService.getGrowthTrends('org-123', 30);
// Now you have 30 days of growth data for visualization
```

---

## Best Practices

### 1. Event Naming Convention

```typescript
// Good: Clear, consistent, action-based
'notebook_created'
'chat_message_sent'
'file_downloaded'
'collaboration_invite_accepted'

// Bad: Vague, inconsistent
'did_something'
'page1'
'user_action'
```

### 2. Comprehensive Event Context

```typescript
await UsageAnalyticsService.recordEvent({
  // ... required fields ...
  eventData: {
    // Performance
    duration_ms: 845,
    // Context
    source: 'ui',
    trigger: 'button_click',
    // Impact
    resultSuccess: true,
    // User state
    accountAge_days: 45,
    isPremium: true,
  },
});
```

### 3. Cohort Hygiene

```typescript
// Refresh cohorts to stay current
setInterval(async () => {
  const cohorts = await db.query.cohorts.findMany({
    where: { isAutomated: true },
  });

  for (const cohort of cohorts) {
    // Recalculate membership and metrics
    const members = await findCohortMembers(cohort.criteria);
    await updateCohortMembers(cohort.id, members);
  }
}, 24 * 60 * 60 * 1000); // Daily
```

### 4. Funnel-Specific Events

```typescript
// Create specific events just for funnels
await UsageAnalyticsService.recordEvent({
  eventName: 'signup_form_step_1_viewed',
  eventCategory: 'funnel_progress',
  eventData: {
    funnelName: 'Signup',
    stepNumber: 1,
    formError: false,
  },
});
```

### 5. Real-time User Detection

```typescript
// Monitor for at-risk users in real-time
setInterval(async () => {
  const atRiskPatterns = await db.query.userBehaviorPatterns.findMany({
    where: {
      organizationId: 'org-123',
      churnProbability: { gte: 70 },
    },
  });

  for (const pattern of atRiskPatterns) {
    // Send re-engagement offer
    await sendReEngagementOffer(pattern.userId);
  }
}, 60 * 60 * 1000); // Hourly
```

---

## Analysis Patterns

### AARRR Metrics Framework

```typescript
// Acquisition
const newUsers = growthMetrics.newUsers;

// Activation
const signupFunnelConversion = funnelAnalysis.conversionRate;

// Revenue
const averageOrderValue = metrics.avgTransactionValue;
const mrr = growthMetrics.monthlyRecurringRevenue;

// Retention
const day30Retention = growthMetrics.day30Retention;
const churnCohort = cohortAnalysis.churnRate;

// Referral
const referralConversions = growthMetrics.referralConversions;
```

### Funnel Optimization Workflow

```typescript
// 1. Identify highest-dropoff step
const dropoffs = analysis.dropoffRates;
const maxDropoff = Math.max(...Object.values(dropoffs));

// 2. Investigate user behavior at that step
const behaviors = await detectBehaviorPatterns(userId, org);

// 3. Implement improvement
// 4. Track new metrics
const newAnalysis = await analyzeFunnel(funnelId);

// 5. Compare improvement
const improvement = newAnalysis.conversionRate - analysis.conversionRate;
```

---

## Metrics Catalog

### Key Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| DAU/MAU | Active Users Daily / Monthly | >30% |
| Conversion Rate | Completions / Entries | Context-dependent |
| Churn Rate | Lost Users / Previous Users | <5% monthly |
| Day 1 Retention | Active Day 1 / Day 0 | >40% |
| Day 30 Retention | Active Day 30 / Day 0 | >20% |
| LTV / CAC | Lifetime Value / Acquisition Cost | >3x |

---

## Roadmap

### Phase 4.4 Complete (Current)

✅ Event Recording & Stream
✅ Funnel Analysis with Dropoff
✅ Cohort Creation & Retention Matrix
✅ Feature Adoption Tracking
✅ User Segmentation
✅ Session Tracking & Attribution
✅ Behavior Pattern Detection
✅ Event Heatmaps
✅ Growth Metrics Dashboard

### Phase 4.5: Cost Analytics & Optimization

- Cost breakdown by service/feature
- Cost forecasting models
- Waste detection and alerts
- Reserved capacity optimization
- Unit economics analysis

---

## Support & Questions

For implementation questions:

1. Review database schema definitions
2. Check service method documentation
3. Review API endpoint examples
4. See usage examples for common patterns
5. Consult best practices section

Last Updated: January 2024
Phase: 4.4 - Usage Analytics & Insights
Status: Complete
