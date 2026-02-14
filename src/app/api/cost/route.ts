import { NextRequest, NextResponse } from 'next/server';
import { getCookies } from '@/lib/auth';
import { verifyUserPermissions } from '@/lib/rbac';
import { CostAnalyticsService } from '@/services/costAnalyticsService';

/**
 * Cost Analytics API Routes
 * 
 * GET /api/cost
 * - action=dashboard: Full cost analytics dashboard
 * - action=trends: Historical cost trends
 * - action=budget: Budget status and projections
 * - action=opportunities: Cost optimization opportunities
 * - action=projections: Cost forecasts
 * 
 * POST /api/cost
 * - action=record-usage: Record service usage and consumption
 * - action=calculate-breakdown: Compute cost breakdown
 * - action=set-budget: Set budget limits
 * - action=update-budget: Update budget usage
 * - action=detect-anomalies: Find unusual spending patterns
 * - action=record-accounting: Attribute costs to entities
 * - action=unit-economics: Calculate revenue vs cost
 * - action=recommend-reserved: Reserved capacity optimization
 * - action=identify-opportunities: Find cost savings
 * - action=generate-billing: Create monthly invoice
 * - action=create-alert: Spending alert
 * - action=forecast-costs: Cost projections
 * - action=detect-wastage: Find underutilized resources
 */

export async function GET(request: NextRequest) {
  try {
    const { userId, organizationId } = await getCookies();

    if (!userId || !organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const hasAccess = await verifyUserPermissions(
      userId,
      organizationId,
      'view_cost_analytics'
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'dashboard': {
        const dashboard = await CostAnalyticsService.getCostDashboard(organizationId);
        return NextResponse.json({ dashboard });
      }

      case 'trends': {
        const months = parseInt(searchParams.get('months') || '12');
        const trends = await CostAnalyticsService.getCostTrends(
          organizationId,
          months
        );
        return NextResponse.json({ trends });
      }

      case 'opportunities': {
        // Return sample opportunities - would load from database in production
        return NextResponse.json({
          opportunities: [
            {
              title: 'Cleanup Unused Instances',
              savings: 450,
              effort: 'low',
              priority: 9,
            },
            {
              title: 'Archive Old Data',
              savings: 350,
              effort: 'medium',
              priority: 8,
            },
            {
              title: 'Optimize Data Transfer',
              savings: 200,
              effort: 'medium',
              priority: 7,
            },
          ],
        });
      }

      case 'projections': {
        const months = parseInt(searchParams.get('months') || '12');
        // Placeholder - would fetch from database
        return NextResponse.json({
          projections: {
            totalProjected: 65000,
            forecastMonths: months,
            confidenceLevel: 75,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Cost analytics GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, organizationId } = await getCookies();

    if (!userId || !organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const hasAccess = await verifyUserPermissions(
      userId,
      organizationId,
      'manage_cost_analytics'
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'record-usage': {
        const {
          serviceName,
          resourceType,
          resourceId,
          unitQuantity,
          unitType,
          usagePeriodStart,
          usagePeriodEnd,
          unitCost,
          commitmentDiscount,
          metadata,
        } = body;

        if (
          !serviceName ||
          !resourceType ||
          unitQuantity === undefined ||
          !unitType ||
          unitCost === undefined
        ) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const usageId = await CostAnalyticsService.recordServiceUsage({
          organizationId,
          serviceName,
          resourceType,
          resourceId,
          unitQuantity,
          unitType,
          usagePeriodStart: new Date(usagePeriodStart),
          usagePeriodEnd: new Date(usagePeriodEnd),
          unitCost,
          commitmentDiscount,
          metadata,
        });

        return NextResponse.json({ usageId });
      }

      case 'calculate-breakdown': {
        const {
          periodStart,
          periodEnd,
          periodType,
          serviceName,
          workspaceId,
          region,
        } = body;

        if (!periodStart || !periodEnd || !periodType) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const breakdownId = await CostAnalyticsService.calculateCostBreakdown({
          organizationId,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          periodType,
          serviceName,
          workspaceId,
          region,
        });

        return NextResponse.json({ breakdownId });
      }

      case 'set-budget': {
        const {
          allocationName,
          allocationLevel,
          targetId,
          monthlyBudgetLimit,
          warningThresholdPercent,
          criticalThresholdPercent,
        } = body;

        if (
          !allocationName ||
          !allocationLevel ||
          !targetId ||
          monthlyBudgetLimit === undefined
        ) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const allocationId = await CostAnalyticsService.setResourceAllocation({
          organizationId,
          allocationName,
          allocationLevel,
          targetId,
          monthlyBudgetLimit,
          warningThresholdPercent,
          criticalThresholdPercent,
        });

        return NextResponse.json({ allocationId });
      }

      case 'update-budget': {
        const { allocationId, currentSpending } = body;

        if (allocationId === undefined || currentSpending === undefined) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const result = await CostAnalyticsService.updateBudgetUsage({
          organizationId,
          allocationId,
          currentSpending,
        });

        return NextResponse.json(result);
      }

      case 'detect-anomalies': {
        const { baselineData, currentValue, serviceName, workspaceId } = body;

        if (!baselineData || currentValue === undefined) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const anomalyId = await CostAnalyticsService.detectCostAnomalies({
          organizationId,
          baselineData,
          currentValue,
          serviceName,
          workspaceId,
        });

        return NextResponse.json({ anomalyId });
      }

      case 'record-accounting': {
        const {
          accountingLevel,
          attributedEntityId,
          attributedEntityName,
          computeCost,
          storageCost,
          networkCost,
          llmCost,
          periodStart,
          periodEnd,
          periodType,
        } = body;

        if (
          !accountingLevel ||
          !attributedEntityId ||
          computeCost === undefined ||
          !periodStart ||
          !periodEnd ||
          !periodType
        ) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const accountingId = await CostAnalyticsService.recordUsageAccounting({
          organizationId,
          accountingLevel,
          attributedEntityId,
          attributedEntityName,
          computeCost,
          storageCost,
          networkCost,
          llmCost,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          periodType,
        });

        return NextResponse.json({ accountingId });
      }

      case 'unit-economics': {
        const {
          totalActiveUsers,
          newUsersThisPeriod,
          churnedUsersThisPeriod,
          totalRevenue,
          totalCostOfGoodsSold,
          totalAcquisitionSpend,
          dayOneRetention,
          day7Retention,
          day30Retention,
        } = body;

        if (
          totalActiveUsers === undefined ||
          totalRevenue === undefined ||
          totalCostOfGoodsSold === undefined
        ) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const economicsId = await CostAnalyticsService.recordUnitEconomics({
          organizationId,
          totalActiveUsers,
          newUsersThisPeriod,
          churnedUsersThisPeriod,
          totalRevenue,
          totalCostOfGoodsSold,
          totalAcquisitionSpend,
          dayOneRetention,
          day7Retention,
          day30Retention,
        });

        return NextResponse.json({ economicsId });
      }

      case 'recommend-reserved': {
        const {
          resourceType,
          region,
          currentOnDemandCost,
          currentUtilization,
          averageHourlyUsage,
          peakHourlyUsage,
        } = body;

        if (
          !resourceType ||
          !region ||
          currentOnDemandCost === undefined ||
          averageHourlyUsage === undefined
        ) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const recommendationId =
          await CostAnalyticsService.recommendReservedCapacity({
            organizationId,
            resourceType,
            region,
            currentOnDemandCost,
            currentUtilization,
            averageHourlyUsage,
            peakHourlyUsage,
          });

        return NextResponse.json({ recommendationId });
      }

      case 'identify-opportunities': {
        const opportunityIds =
          await CostAnalyticsService.identifyOptimizationOpportunities(
            organizationId
          );

        return NextResponse.json({ opportunityIds });
      }

      case 'record-unit-economics': {
        const economics = body;

        const economicsId = await CostAnalyticsService.recordUnitEconomics({
          organizationId,
          ...economics,
        });

        return NextResponse.json({ economicsId });
      }

      case 'generate-billing': {
        const {
          billingMonth,
          computeCharges,
          storageCharges,
          networkCharges,
          databaseCharges,
          llmServiceCharges,
          credits,
          discounts,
          tax,
        } = body;

        if (
          !billingMonth ||
          computeCharges === undefined ||
          storageCharges === undefined
        ) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const invoiceId = await CostAnalyticsService.generateMonthlyBilling({
          organizationId,
          billingMonth: new Date(billingMonth),
          computeCharges,
          storageCharges,
          networkCharges,
          databaseCharges,
          llmServiceCharges,
          credits,
          discounts,
          tax,
        });

        return NextResponse.json({ invoiceId });
      }

      case 'create-alert': {
        const {
          alertType,
          severity,
          currentValue,
          thresholdValue,
          workspaceId,
          serviceName,
        } = body;

        if (
          !alertType ||
          !severity ||
          currentValue === undefined ||
          thresholdValue === undefined
        ) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const alertId = await CostAnalyticsService.createCostAlert({
          organizationId,
          alertType,
          severity,
          currentValue,
          thresholdValue,
          workspaceId,
          serviceName,
        });

        return NextResponse.json({ alertId });
      }

      case 'forecast-costs': {
        const { historicalMonths, forecastMonths } = body;

        if (historicalMonths === undefined || forecastMonths === undefined) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const projectionId = await CostAnalyticsService.generateCostProjection({
          organizationId,
          historicalMonths,
          forecastMonths,
        });

        return NextResponse.json({ projectionId });
      }

      case 'detect-wastage': {
        const {
          resourceType,
          resourceId,
          currentCostMonthly,
          estimatedUtilization,
        } = body;

        if (
          !resourceType ||
          !resourceId ||
          currentCostMonthly === undefined ||
          estimatedUtilization === undefined
        ) {
          return NextResponse.json(
            { error: 'Missing required fields' },
            { status: 400 }
          );
        }

        const wastageId = await CostAnalyticsService.detectWastage({
          organizationId,
          resourceType,
          resourceId,
          currentCostMonthly,
          estimatedUtilization,
        });

        return NextResponse.json({ wastageId });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Cost analytics POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
