# Cost Analytics & Optimization - Phase 4.5

Complete infrastructure cost tracking, analysis, forecasting, waste detection, and optimization system for the Mastiff platform.

**Executive Summary**: Cost Analytics enables complete cost visibility across compute, storage, networking, LLM services, and more. It provides budget controls, anomaly detection, waste identification, and optimization recommendations to maximize financial efficiency while maintaining performance.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Service Layer](#service-layer)
4. [API Endpoints](#api-endpoints)
5. [Usage Examples](#usage-examples)
6. [Best Practices](#best-practices)
7. [Cost Optimization Patterns](#cost-optimization-patterns)
8. [Metrics Catalog](#metrics-catalog)
9. [Integration with Other Phases](#integration-with-other-phases)
10. [Roadmap](#roadmap)

---

## Architecture Overview

### Core Components

**Cost Analytics Stack**:

```
Infrastructure Services (Compute, Storage, Network, LLM)
    ↓ (usage metrics)
Telemetry Collection ← Phase 4.1 (Observability)
    ↓
API Routes (/api/cost)
    ↓
CostAnalyticsService
    ├── Service Usage Recording
    │   └── Raw consumption metrics
    │
    ├── Cost Breakdown
    │   ├── By service (compute, storage, etc)
    │   ├── By time period (hourly, daily, monthly)
    │   ├── By dimension (workspace, user, region)
    │   └── Utilization analysis
    │
    ├── Budget Management
    │   ├── Budget allocation
    │   ├── Spending tracking
    │   ├── Forecast to month-end
    │   └── Alert generation
    │
    ├── Anomaly Detection
    │   ├── Statistical outlier detection
    │   ├── Trend change detection
    │   ├── Pattern analysis
    │   └── Alert triggering
    │
    ├── Cost Attribution
    │   ├── Per-user costs
    │   ├── Per-workspace costs
    │   ├── Per-feature costs
    │   └── Chargeback models
    │
    ├── Unit Economics
    │   ├── Revenue vs cost analysis
    │   ├── LTV/CAC ratio
    │   ├── Margin analysis
    │   └── Payback period
    │
    ├── Capacity Optimization
    │   ├── Reserved instance recommendations
    │   ├── Spot instance recommendations
    │   ├── Right-sizing analysis
    │   └── Commitment analysis
    │
    ├── Waste Detection
    │   ├── Idle resource detection
    │   ├── Underutilization scoring
    │   ├── Wastage quantification
    │   └── Remediation recommendations
    │
    ├── Forecasting
    │   ├── Trend-based forecasting
    │   ├── Seasonal pattern detection
    │   ├── Growth rate projection
    │   └── ML-based prediction
    │
    └── Billing & Reconciliation
        ├── Monthly invoice generation
        ├── Service-level billing
        ├── Tax and discount handling
        └── Payment tracking
    ↓
Cost Analytics Database Schema
    ├── serviceUsage (Raw consumption)
    ├── costBreakdown (Aggregated costs)
    ├── resourceAllocation (Budget control)
    ├── costAnomalies (Unusual patterns)
    ├── usageAccounting (Attribution)
    ├── unitEconomics (Revenue metrics)
    ├── reservedCapacityOptimization (Recommendations)
    ├── costOptimizationOpportunities (Savings)
    ├── monthlyBillingRecord (Invoices)
    ├── costAlerts (Real-time alerts)
    ├── costProjections (Forecasts)
    └── wastageAnalysis (Underutilization)
    ↓
Phase 4.4 Usage Analytics ← Session and feature tracking
Phase 4.2 Performance Analytics ← Resource utilization metrics
Phase 4.3 Error Tracking ← Error-related cost impact
Phase 4.1 Observability ← Metrics and logs
```

### Key Features

| Feature | Purpose | Use Case |
|---------|---------|----------|
| **Service Usage Tracking** | Capture consumption metrics | Track CPU hours, GB stored, API calls |
| **Cost Breakdown** | Aggregate costs by dimension | Understand service/workspace/region costs |
| **Budget Control** | Set spending limits | Prevent budget overruns |
| **Anomaly Detection** | Find spikes/drops | Alert on unusual spending patterns |
| **Cost Attribution** | Assign costs to entities | Chargeback to users/teams/projects |
| **Unit Economics** | Revenue vs cost | LTV/CAC ratio, payback period |
| **Capacity Optimization** | Right-sizing recommendations | 35% cost savings with reserved instances |
| **Waste Detection** | Find idle resources | Identify and remove unused capacity |
| **Cost Forecasting** | Predict future costs | Budget planning and capacity planning |
| **Billing** | Monthly invoicing | Invoice generation and payment tracking |

---

## Database Schema

### serviceUsageTable

Raw consumption metrics from infrastructure services.

```typescript
{
  id: number;
  organizationId: string;
  workspaceId?: string;
  
  // Service identification
  serviceName: string;           // compute, storage, network, database, llm
  resourceType: string;          // instance-type, storage-gb, api-calls
  resourceId?: string;           // specific resource identifier
  
  // Consumption
  unitQuantity: number;          // 100.5 CPU hours, 250 GB, 50K API calls
  unitType: string;              // cpu-hours, storage-gb, api-calls, gpu-hours
  usagePeriodStart: Date;
  usagePeriodEnd: Date;
  
  // Pricing
  unitCost: number;              // cost per unit
  totalCost: number;             // unitQuantity * unitCost * (1 - discount%)
  commitmentDiscount?: number;   // % discount from commitment
  
  // Metadata
  metadata?: {
    region?: string;
    tier?: string;
    tags?: Record<string, string>;
    costModel?: string;
  };
  
  timestamp: Date;
  createdAt: Date;
}
```

**Example Records**:

```typescript
// Compute: 100 CPU hours @ $0.50/hour = $50
{
  serviceName: 'compute',
  resourceType: 'cpu-hours',
  unitQuantity: 100,
  unitType: 'cpu-hours',
  unitCost: 0.50,
  totalCost: 50.00,
  commitmentDiscount: 20, // 20% from 1-year commitment
}

// Storage: 500 GB @ $0.023/GB/month = $11.50
{
  serviceName: 'storage',
  resourceType: 'storage-gb',
  unitQuantity: 500,
  unitType: 'storage-gb',
  unitCost: 0.023,
  totalCost: 11.50,
}

// LLM API: 1M tokens @ $0.000015 = $15
{
  serviceName: 'llm_services',
  resourceType: 'api-calls',
  unitQuantity: 1000000,
  unitType: 'tokens',
  unitCost: 0.000015,
  totalCost: 15.00,
}
```

### costBreakdownTable

Aggregated costs by service, dimension, and time period.

```typescript
{
  id: number;
  organizationId: string;
  
  // Time period
  periodDate: Date;              // YYYY-MM-DD 00:00:00
  periodType: string;            // hourly, daily, weekly, monthly
  periodStart: Date;
  periodEnd: Date;
  
  // Dimensions
  serviceName: string;
  workspaceId?: string;
  userId?: string;
  region?: string;
  
  // Costs by service
  computeCost: number;           // sum of all compute costs
  storageCost: number;           // sum of all storage costs
  networkCost: number;           // sum of all network costs
  databaseCost: number;          // sum of all database costs
  llmServicesCost: number;       // sum of all LLM costs
  otherCosts: number;
  totalCost: number;             // sum of all
  
  // Efficiency
  costUtilizationRatio: number;  // % (75% = 75)
  wastedCost: number;            // $ attributed to waste
  reservedInstanceSavings: number; // $ saved by commitments
  
  createdAt: Date;
}
```

### resourceAllocationTable

Budget allocation and spending tracking.

```typescript
{
  id: number;
  organizationId: string;
  
  // Allocation target
  allocationName: string;        // "Q1 Cloud Budget", "Data Team Budget"
  allocationLevel: string;       // organization, workspace, project, team
  targetId: string;              // org/workspace/project/team ID
  
  // Budget
  monthlyBudgetLimit: number;    // $5000
  currentMonthSpending: number;  // $3250
  percentageOfBudget: number;    // 65%
  budgetStatus: string;          // on_track, warning, exceeded
  
  // Forecast
  projectedMonthlySpend: number; // $4500 estimated
  projectedExceedanceAmount?: number;
  forecast30Days: number;
  forecast90Days: number;
  
  // Thresholds
  warningThresholdPercent: number; // 75%
  criticalThresholdPercent: number; // 90%
  
  // Alerts
  emailAlertsEnabled: boolean;
  alertEmails?: string;
  
  createdAt: Date;
  updatedAt: Date;
}
```

### costAnomaliesTable

Detected unusual spending patterns.

```typescript
{
  id: number;
  organizationId: string;
  
  // Anomaly type
  anomalyType: string;           // spike, trend_change, resource_waste
  severity: string;              // low, medium, high, critical
  
  // Deviation
  currentValue: number;          // $5000 observed
  expectedValue: number;         // $1000 baseline
  deviationAmount: number;       // $4000
  deviationPercent: number;      // 400%
  
  // Context
  serviceName?: string;
  resourceType?: string;
  workspaceId?: string;
  
  // Metadata
  anomalyMetadata?: {
    baselineValue?: number;
    sigma?: number;              // standard deviations
    detectionMethod?: string;
    relatedResources?: string[];
  };
  
  // Management
  detectedAt: Date;
  notificationSent: boolean;
  acknowledged: boolean;
  acknowledgedBy?: string;
  isResolved: boolean;
}
```

### unitEconomicsTable

Revenue vs cost analysis for business metrics.

```typescript
{
  id: number;
  organizationId: string;
  
  // Period
  periodDate: Date;
  periodType: string;            // monthly (typically)
  
  // Users
  totalActiveUsers: number;
  newUsersThisPeriod: number;
  churnedUsersThisPeriod: number;
  
  // Revenue
  totalRevenue: number;          // $50,000
  monthlyRecurringRevenue: number; // $42,500
  averageRevenuePerUser: number; // $500
  
  // Costs (COGS - Cost of Goods Sold)
  totalCostOfGoodsSold: number;  // $15,000
  averageCostPerUser: number;    // $150
  computeCostPercentage: number; // 35%
  storageCostPercentage: number; // 25%
  llmCostPercentage: number;     // 40%
  
  // Key Metrics
  grossMargin: number;           // 70%
  customerLifetimeValue: number; // $12,000
  paybackPeriodDays: number;     // 9 days
  
  // Acquisition
  totalAcquisitionSpend: number; // $8,000
  customerAcquisitionCost: number; // $400
  ltv_cac_ratio: number;         // 30x (excellent!)
  
  createdAt: Date;
}
```

### reservedCapacityOptimizationTable

Recommendations for reserved instances and capacity commitments.

```typescript
{
  id: number;
  organizationId: string;
  
  // Target
  recommendationType: string;    // reserved_instances, spot_instances, etc
  resourceType: string;          // cpu, memory, gpu, storage
  region: string;
  
  // Current usage
  currentOnDemandCost: number;   // $5,000/month
  currentUtilization: number;    // 85%
  averageHourlyUsage: number;    // 800 units
  peakHourlyUsage: number;       // 900 units
  
  // Recommendation
  recommendedCapacity: number;   // 960 units (peak + 6.7% buffer)
  reservedCapacityCost: number;  // $3,250/month
  annualCostSavings: number;     // $21,000
  paybackMonths: number;         // 2 months
  utilizationImprovement: number; // +5%
  
  // Details
  analysisDate: Date;
  commitmentTerm: string;        // 1yr, 3yr
  recommendation?: {
    reasons?: string[];
    riskFactors?: string[];
  };
  
  // Tracking
  implemented: boolean;
  implementedAt?: Date;
  dismissed: boolean;
}
```

### costOptimizationOpportunitiesTable

Specific cost savings opportunities with implementation details.

```typescript
{
  id: number;
  organizationId: string;
  
  // Identification
  opportunityType: string;       // unused_resources, storage_tiering, etc
  title: string;                 // "Archive Old Notebooks"
  description: string;
  
  // Impact
  estimatedMonthlySavings: number; // $350
  estimatedAnnualSavings: number;  // $4,200
  implementationEffort: string;    // low, medium, high
  
  // Details
  affectedResources?: {
    resourceIds?: string[];
    serviceNames?: string[];
    impactedUsers?: number;
  };
  implementationSteps?: string[];
  riskFactors?: string[];
  
  // Tracking
  priority: number;              // 1-10
  status: string;                // open, in_progress, implemented
  statusNotes?: string;
  implementedAt?: Date;
  actualSavings?: number;        // $380 (better than expected!)
  
  dismissalReason?: string;
  dismissedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}
```

### costProjectionsTable

Forecasted costs based on historical data and trends.

```typescript
{
  id: number;
  organizationId: string;
  
  // Forecast definition
  forecastType: string;          // trend, seasonal, ml_based
  modelVersion: string;
  basedOnHistoryMonths: number;  // 12 months history
  
  // Period
  forecastStartDate: Date;
  forecastEndDate: Date;
  
  // Forecast data
  totalProjectedCost: number;    // $120,000 for period
  forecastedCosts: {             // daily/monthly breakdown
    [date: string]: number;
  };
  
  // By service
  computeProjection: number;
  storageProjection: number;
  networkProjection: number;
  llmProjection: number;
  
  // Confidence
  confidenceLevel: number;       // 75%
  growthAssumptions?: {
    userGrowthRate?: number;     // 0.05 = 5%
    featureAdoptionRate?: number;
    seasonalFactors?: Record<string, number>;
  };
  
  // Accuracy
  actualCostToDate: number;
  variance: number;
  variancePercent: number;       // -3.5%
  modelAccuracyScore: number;    // 78%
  
  createdAt: Date;
}
```

### wastageAnalysisTable

Underutilized and idle resources.

```typescript
{
  id: number;
  organizationId: string;
  
  // Resource
  wastageType: string;           // idle_instances, overprovisioned, etc
  resourceType: string;          // compute, storage, database
  resourceId: string;
  
  // Metrics
  currentCostMonthly: number;    // $500
  estimatedUtilization: number;  // 15%
  wastedCostMonthly: number;     // $425 (85% waste)
  wastedCostAnnually: number;    // $5,100
  
  // Information
  description: string;
  evidence?: {
    metrics?: Record<string, any>;
    samples?: Record<string, any>[];
  };
  
  // Recommendation
  recommendedAction: string;     // Stop instance, resize, consolidate
  potentialSavings: number;
  
  // Tracking
  severity: string;              // low, medium, high
  detectedAt: Date;
  addressed: boolean;
  addressedAt?: Date;
  addressedAction?: string;
  
  createdAt: Date;
}
```

---

## Service Layer

### CostAnalyticsService

Complete implementation for cost tracking and optimization.

#### recordServiceUsage()

Record infrastructure consumption.

```typescript
static async recordServiceUsage(params: {
  organizationId: string;
  workspaceId?: string;
  serviceName: string;           // compute, storage, network, llm
  resourceType: string;          // cpu-hours, storage-gb, api-calls
  resourceId?: string;
  unitQuantity: number;
  unitType: string;
  usagePeriodStart: Date;
  usagePeriodEnd: Date;
  unitCost: number;
  commitmentDiscount?: number;   // percentage
  metadata?: any;
}): Promise<string>
```

#### calculateCostBreakdown()

Aggregate costs by service and dimension.

```typescript
static async calculateCostBreakdown(params: {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  periodType: string;            // hourly, daily, monthly
  serviceName?: string;
  workspaceId?: string;
  userId?: string;
  region?: string;
}): Promise<string>
```

#### setResourceAllocation()

Set budget limits.

```typescript
static async setResourceAllocation(params: {
  organizationId: string;
  allocationName: string;
  allocationLevel: string;       // organization, workspace, project
  targetId: string;
  monthlyBudgetLimit: number;
  warningThresholdPercent?: number;
  criticalThresholdPercent?: number;
  emailAlerts?: boolean;
}): Promise<string>
```

#### updateBudgetUsage()

Track spending against budget.

```typescript
static async updateBudgetUsage(params: {
  organizationId: string;
  allocationId: string;
  currentSpending: number;
}): Promise<{
  percentageUsed: number;
  budgetStatus: string;        // on_track, warning, exceeded
  projectedMonthEnd: number;
}>
```

#### detectCostAnomalies()

Identify unusual spending patterns using statistical analysis.

```typescript
static async detectCostAnomalies(params: {
  organizationId: string;
  baselineData: number[];       // Last 30 days of costs
  currentValue: number;
  serviceName?: string;
  workspaceId?: string;
}): Promise<string | null>
```

#### recordUsageAccounting()

Attribute costs to users, workspaces, or features.

```typescript
static async recordUsageAccounting(params: {
  organizationId: string;
  accountingLevel: string;       // user, workspace, feature
  attributedEntityId: string;
  attributedEntityName?: string;
  computeCost: number;
  storageCost: number;
  networkCost: number;
  llmCost: number;
  periodStart: Date;
  periodEnd: Date;
  periodType: string;
}): Promise<string>
```

#### recordUnitEconomics()

Calculate revenue vs cost metrics.

```typescript
static async recordUnitEconomics(params: {
  organizationId: string;
  totalActiveUsers: number;
  newUsersThisPeriod: number;
  churnedUsersThisPeriod: number;
  totalRevenue: number;
  totalCostOfGoodsSold: number;
  totalAcquisitionSpend: number;
  dayOneRetention: number;
  day7Retention: number;
  day30Retention: number;
}): Promise<string>
```

**Returns**: User metrics calculated:
- **LTV/CAC Ratio**: Should be > 3x for healthy unit economics
- **Payback Period**: Days to recover customer acquisition cost
- **Gross Margin**: Revenue minus COGS as percentage
- **CAC**: Cost to acquire one customer

#### recommendReservedCapacity()

Generate optimization recommendations.

```typescript
static async recommendReservedCapacity(params: {
  organizationId: string;
  resourceType: string;
  region: string;
  currentOnDemandCost: number;
  currentUtilization: number;
  averageHourlyUsage: number;
  peakHourlyUsage: number;
  commitmentTerm?: string;       // 1yr, 3yr
}): Promise<string>
```

#### identifyOptimizationOpportunities()

Find specific cost savings opportunities.

```typescript
static async identifyOptimizationOpportunities(
  organizationId: string
): Promise<string[]>
```

#### generateCostProjection()

Forecast costs based on trends.

```typescript
static async generateCostProjection(params: {
  organizationId: string;
  historicalMonths: number;
  forecastMonths: number;
  confidenceLevel?: number;      // 0-100
}): Promise<string>
```

#### detectWastage()

Find underutilized resources.

```typescript
static async detectWastage(params: {
  organizationId: string;
  resourceType: string;
  resourceId: string;
  currentCostMonthly: number;
  estimatedUtilization: number;  // 0-100%
}): Promise<string | null>
```

#### getCostDashboard()

Get comprehensive cost dashboard.

```typescript
static async getCostDashboard(organizationId: string): Promise<{
  currentCosts: {
    dailyCost: number;
    monthlyCost: number;
    annualCost: number;
  };
  costBreakdown: Record<string, number>;
  budgetStatus: Array<{
    name: string;
    used: number;
    limit: number;
    percentage: number;
  }>;
  topOptimizations: Array<{
    title: string;
    savings: number;
    effort: string;
  }>;
  alerts: Array<{
    type: string;
    severity: string;
    message: string;
  }>;
}>
```

---

## API Endpoints

Base URL: `/api/cost`

### GET Endpoints

#### Get Cost Dashboard

```
GET /api/cost?action=dashboard&organizationId={orgId}
```

**Response**:

```json
{
  "dashboard": {
    "currentCosts": {
      "dailyCost": 150.00,
      "monthlyCost": 4500.00,
      "annualCost": 54000.00
    },
    "costBreakdown": {
      "compute": 1575.00,
      "storage": 900.00,
      "network": 450.00,
      "database": 450.00,
      "llm": 1125.00
    },
    "budgetStatus": [
      {
        "name": "Q1 Budget",
        "used": 3250.00,
        "limit": 5000.00,
        "percentage": 65.0
      }
    ],
    "topOptimizations": [...],
    "alerts": [...]
  }
}
```

#### Get Cost Trends

```
GET /api/cost?action=trends&organizationId={orgId}&months=12
```

#### Get Optimization Opportunities

```
GET /api/cost?action=opportunities&organizationId={orgId}
```

#### Get Cost Projections

```
GET /api/cost?action=projections&organizationId={orgId}&months=12
```

### POST Endpoints

#### Record Service Usage

```
POST /api/cost
{
  "action": "record-usage",
  "organizationId": "org-123",
  "serviceName": "compute",
  "resourceType": "cpu-hours",
  "unitQuantity": 100,
  "unitType": "cpu-hours",
  "usagePeriodStart": "2024-01-15T00:00:00Z",
  "usagePeriodEnd": "2024-01-16T00:00:00Z",
  "unitCost": 0.50,
  "commitmentDiscount": 20
}
```

#### Set Budget

```
POST /api/cost
{
  "action": "set-budget",
  "organizationId": "org-123",
  "allocationName": "Engineering Team Q1",
  "allocationLevel": "team",
  "targetId": "team-456",
  "monthlyBudgetLimit": 8000,
  "warningThresholdPercent": 75,
  "criticalThresholdPercent": 90
}
```

#### Detect Cost Anomalies

```
POST /api/cost
{
  "action": "detect-anomalies",
  "organizationId": "org-123",
  "baselineData": [1000, 1050, 975, 1025, 1100],
  "currentValue": 5000,
  "serviceName": "compute"
}
```

#### Record Unit Economics

```
POST /api/cost
{
  "action": "unit-economics",
  "organizationId": "org-123",
  "totalActiveUsers": 5000,
  "newUsersThisPeriod": 500,
  "churnedUsersThisPeriod": 150,
  "totalRevenue": 100000,
  "totalCostOfGoodsSold": 30000,
  "totalAcquisitionSpend": 20000,
  "dayOneRetention": 75,
  "day7Retention": 65,
  "day30Retention": 50
}
```

#### Recommend Reserved Capacity

```
POST /api/cost
{
  "action": "recommend-reserved",
  "organizationId": "org-123",
  "resourceType": "compute",
  "region": "us-east-1",
  "currentOnDemandCost": 5000,
  "currentUtilization": 85,
  "averageHourlyUsage": 800,
  "peakHourlyUsage": 900
}
```

#### Generate Cost Projection

```
POST /api/cost
{
  "action": "forecast-costs",
  "organizationId": "org-123",
  "historicalMonths": 12,
  "forecastMonths": 6
}
```

---

## Usage Examples

### Complete Cost Tracking Implementation

```typescript
// 1. Record consumption
const usageId = await CostAnalyticsService.recordServiceUsage({
  organizationId: 'org-123',
  serviceName: 'compute',
  resourceType: 'cpu-hours',
  unitQuantity: 100,
  unitType: 'cpu-hours',
  usagePeriodStart: new Date('2024-01-15'),
  usagePeriodEnd: new Date('2024-01-16'),
  unitCost: 0.50,
  commitmentDiscount: 20, // 20% from annual commitment
});

// 2. Calculate cost breakdown
const breakdownId = await CostAnalyticsService.calculateCostBreakdown({
  organizationId: 'org-123',
  periodStart: new Date('2024-01-15'),
  periodEnd: new Date('2024-01-16'),
  periodType: 'daily',
});

// 3. Set budget
const allocationId = await CostAnalyticsService.setResourceAllocation({
  organizationId: 'org-123',
  allocationName: 'Engineering Q1 Budget',
  allocationLevel: 'team',
  targetId: 'team-456',
  monthlyBudgetLimit: 8000,
  warningThresholdPercent: 75,
  criticalThresholdPercent: 90,
});

// 4. Track spending
const budgetStatus = await CostAnalyticsService.updateBudgetUsage({
  organizationId: 'org-123',
  allocationId: 'alloc-789',
  currentSpending: 5200,
});

// 5. Detect anomalies
const baselineData = [1000, 1050, 975, 1025, 1100];
const anomalyId = await CostAnalyticsService.detectCostAnomalies({
  organizationId: 'org-123',
  baselineData,
  currentValue: 5000,
  serviceName: 'compute',
});

// 6. Attribute costs
const accountingId = await CostAnalyticsService.recordUsageAccounting({
  organizationId: 'org-123',
  accountingLevel: 'workspace',
  attributedEntityId: 'ws-100',
  computeCost: 1575,
  storageCost: 450,
  networkCost: 225,
  llmCost: 500,
  periodStart: new Date('2024-01-15'),
  periodEnd: new Date('2024-01-16'),
  periodType: 'daily',
});

// 7. Calculate unit economics
const economicsId = await CostAnalyticsService.recordUnitEconomics({
  organizationId: 'org-123',
  totalActiveUsers: 5000,
  newUsersThisPeriod: 500,
  churnedUsersThisPeriod: 150,
  totalRevenue: 100000,
  totalCostOfGoodsSold: 30000,
  totalAcquisitionSpend: 20000,
  dayOneRetention: 75,
  day7Retention: 65,
  day30Retention: 50,
});
// Result: LTV=$12,000, CAC=$40, LTV/CAC=300x!

// 8. Get recommendations
const reservationId = await CostAnalyticsService.recommendReservedCapacity({
  organizationId: 'org-123',
  resourceType: 'compute',
  region: 'us-east-1',
  currentOnDemandCost: 5000,
  currentUtilization: 85,
  averageHourlyUsage: 800,
  peakHourlyUsage: 900,
});

// 9. Find optimization opportunities
const opportunityIds = await CostAnalyticsService.identifyOptimizationOpportunities(
  'org-123'
);

// 10. Get dashboard
const dashboard = await CostAnalyticsService.getCostDashboard('org-123');
// Shows: costs, breakdown, budget status, opportunities, alerts
```

### Budget Monitoring Workflow

```typescript
// Set up monthly budget with alerts
const allocationId = await CostAnalyticsService.setResourceAllocation({
  organizationId: 'org-123',
  allocationName: 'Data Processing Team Monthly',
  allocationLevel: 'team',
  targetId: 'team-data-processing',
  monthlyBudgetLimit: 10000,
  warningThresholdPercent: 75,    // Alert at 75%
  criticalThresholdPercent: 90,   // Critical at 90%
  emailAlerts: true,
});

// Daily update of spending
setInterval(async () => {
  const dailySpent = await calculateDailySpending('org-123', 'team-data-processing');
  const budgetStatus = await CostAnalyticsService.updateBudgetUsage({
    organizationId: 'org-123',
    allocationId,
    currentSpending: dailySpent,
  });

  if (budgetStatus.budgetStatus === 'exceeded') {
    // Send urgent notification
    await notifyTeadLead('Budget exceeded!');
  }
}, 24 * 60 * 60 * 1000); // Daily
```

### Cost Optimization Workflow

```typescript
// 1. Detect wastage
const wastedResources = await scanforWastage('org-123');
for (const resource of wastedResources) {
  const wastageId = await CostAnalyticsService.detectWastage({
    organizationId: 'org-123',
    resourceType: resource.type,
    resourceId: resource.id,
    currentCostMonthly: resource.monthlyCost,
    estimatedUtilization: resource.utilization,
  });
}

// 2. Get optimization opportunities
const opportunities = await CostAnalyticsService.identifyOptimizationOpportunities(
  'org-123'
);

// 3. Rank and implement
const topOpportunities = opportunities
  .sort((a, b) => b.estimatedSavings - a.estimatedSavings)
  .slice(0, 5);

// 4. Forecast impact
const projectionId = await CostAnalyticsService.generateCostProjection({
  organizationId: 'org-123',
  historicalMonths: 12,
  forecastMonths: 12,
});
// Now can see projected 35% reduction with optimizations
```

---

## Best Practices

### 1. Real-Time Cost Awareness

```typescript
// Show cost in real-time UI for every feature
async function getUserCost(userId: string, organizationId: string, feature: string) {
  const costing = await db
    .select()
    .from(usageAccountingTable)
    .where(
      and(
        eq(usageAccountingTable.organizationId, organizationId),
        eq(usageAccountingTable.accountingLevel, 'user'),
        eq(usageAccountingTable.attributedEntityId, userId)
      )
    );

  return costing.reduce((sum, c) => sum + parseFloat(c.totalCost || '0'), 0);
}
```

### 2. Progressive Budget Enforcement

```typescript
// Tier 1: Warning (75% of budget)
if (percentageUsed >= 75) {
  await notifyTeamLeads('Warning: 75% of budget used');
}

// Tier 2: Review Required (85% of budget)
if (percentageUsed >= 85) {
  await requireManagerApproval('Team at 85% budget');
}

// Tier 3: Hard Stop (100% of budget)
if (percentageUsed >= 100) {
  await throttleService('Budget exceeded - service throttled');
}
```

### 3. Anomaly Investigation Protocol

```typescript
// When anomaly detected
async function handleCostAnomaly(anomaly: CostAnomaly) {
  // 1. Identify root cause
  const correlatedErrors = await findErrors(anomaly.serviceName, anomaly.detectedAt);
  const performanceDegradation = await findPerformanceIssues(
    anomaly.serviceName,
    anomaly.detectedAt
  );

  // 2. Investigate related events
  const usageEvents = await db
    .select()
    .from(usageAccountingTable)
    .where(
      and(
        eq(usageAccountingTable.organizationId, anomaly.organizationId),
        eq(usageAccountingTable.periodStart, anomaly.detectedAt),
        gte(usageAccountingTable.totalCost, anomaly.deviationAmount)
      )
    );

  // 3. Escalate if critical
  if (anomaly.sigma > 3) {
    await escalateToEngineering(anomaly, correlatedErrors);
  }
}
```

### 4. Monthly Billing Automation

```typescript
// Monthly billing generation (1st of month)
@cron('0 0 1 * *')
async function generateMonthlyBilling() {
  const organizations = await getAllOrganizations();

  for (const org of organizations) {
    const breakdown = await calculateMonthlyBreakdown(org.id);
    const invoiceId = await CostAnalyticsService.generateMonthlyBilling({
      organizationId: org.id,
      billingMonth: new Date(),
      computeCharges: breakdown.compute,
      storageCharges: breakdown.storage,
      networkCharges: breakdown.network,
      databaseCharges: breakdown.database,
      llmServiceCharges: breakdown.llm,
      tax: breakdown.tax,
      discounts: breakdown.discounts,
    });

    await sendInvoice(org.id, invoiceId);
  }
}
```

---

## Cost Optimization Patterns

### Pattern 1: Resource Right-Sizing

```typescript
// Analyze utilization patterns
const avgUtilization = calculateAverageUtilization(resource, last30Days);
const peakUtilization = calculatePeakUtilization(resource, last30Days);

// If peak is 2x average, we're over-provisioned
const utilizationRatio = peakUtilization / avgUtilization;
if (utilizationRatio < 1.5) {
  // Recommend downsizing
  await recommendRightSizing(resource, utilizationRatio);
}
```

### Pattern 2: Commitment Optimization

```typescript
// Monthly cost * 12 / (1 - reservation_discount)
// If using >80% of reserved capacity, increase reservation
// If using <50% of reserved capacity, reduce reservation

const reservedUnits = getReservedCapacity(resource);
const actualUsage = getAverageMonthlyUsage(resource);
const utilizationRate = (actualUsage / reservedUnits) * 100;

if (utilizationRate > 80) {
  await recommendIncreaseReservation(resource, utilizationRate);
} else if (utilizationRate < 50) {
  await recommendDecreaseReservation(resource, utilizationRate);
}
```

### Pattern 3: Usage-Based Pricing Optimization

```typescript
// For services like LLM APIs, smaller/longer sessions more optimal
// 10 small calls more expensive than 1 large call
function optimizeApiCalls(calls: ApiCall[]) {
  // Batch related calls together
  const batches = groupRelatedCalls(calls);
  
  // Estimated savings: 15-40% per optimization
  return batches.map(batch => ({
    estimated_savings: batch.length * batch[0].cost * 0.25,
  }));
}
```

---

## Metrics Catalog

### Financial Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| Daily Cost | Monthly Cost / 30 | Stable |
| Monthly Cost | Sum of all service costs | Budgeted |
| Cost per User | Total Cost / Active Users | $150-300 |
| Cost per Revenue $ | Total Cost / Revenue | <30% |
| Gross Margin | (Revenue - COGS) / Revenue | >65% |

### Efficiency Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| LTV/CAC Ratio | Lifetime Value / CAC | >3x |
| Payback Period | CAC / MRR per Customer | <6 months |
| Resource Utilization | Actual / Reserved | >75% |
| Wasted Spend | Underutilized Costs | <5% |
| Reservation Efficiency | Reservation Savings / Reserve Cost | >35% |

---

## Integration with Other Phases

### With Phase 4.1 (Observability)

**Trigger: Alerts come from metrics and logs**

```typescript
// When error spike detected in Phase 4.3
→ Creates cost anomaly alert (Phase 4.5)
// When performance degrades in Phase 4.2
→ Triggers cost investigation (Phase 4.5)
```

### With Phase 4.2 (Performance Analytics)

**Link: Performance metrics determine resource costs**

```typescript
// High latency → Provisioning more resources → More costs
// Optimal caching → Fewer API calls → Lower LLM costs
```

### With Phase 4.3 (Error Tracking)

**Link: Errors relate to cost spikes**

```typescript
// Infinite loop → Runaway compute → Cost spike → Anomaly alert
// Memory leak → Increasing resource usage → Wasted spending
```

### With Phase 4.4 (Usage Analytics)

**Link: Usage drives costs**

```typescript
// High feature adoption → More compute needed → Cost increase
// User abandonment → Wasted provisioning → Optimization opportunity
```

---

## Roadmap

### Phase 4.5 Complete (Current)

✅ Service usage recording and tracking
✅ Cost breakdown by service, dimension, time period
✅ Budget allocation and enforcement
✅ Cost anomaly detection (statistical analysis)
✅ Cost attribution (user, workspace, feature)
✅ Unit economics (LTV, CAC, margins)
✅ Reserved capacity optimization recommendations
✅ Cost optimization opportunity identification
✅ Monthly billing generation
✅ Cost forecasting and projections
✅ Waste detection and reporting
✅ Cost alerts and notifications

### Phase 5: FinOps Maturity (Proposed)

- Cost governance workflows
- Departmental chargeback automation
- Cloud cost management platform integration (Datadog, CloudHealth, etc.)
- Predictive cost anomaly (ML-based)
- Reserved instance marketplace recommendations
- Cost allocation engine (per-customer for SaaS)
- Cost transparency dashboards by role
- Automated cost optimization execution

---

## Support & Questions

For implementation questions:

1. Review database schema definitions
2. Check service method documentation
3. Review API endpoint examples
4. See usage examples for common patterns
5. Consult best practices and cost optimization sections

Last Updated: January 2024
Phase: 4.5 - Cost Analytics & Optimization
Status: Complete
