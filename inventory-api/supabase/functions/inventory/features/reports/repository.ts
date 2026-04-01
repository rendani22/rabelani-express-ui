/**
 * Reports Repository
 * Database access layer for report generation
 */

import { db } from '../../database/supabase-client.ts';
import { arrayToCamelCase } from '../../database/queries.ts';
import type {
  ValuationReport,
  ValuationSummary,
  CategoryValuation,
  LocationValuation,
  ItemValuation,
  MovementReport,
  MovementReportSummary,
  MovementTypeSummary,
  ItemMovementSummary,
  DailyMovementTrend,
  TurnoverReport,
  TurnoverSummary,
  ItemTurnover,
  CategoryTurnover,
  ValuationReportParams,
  MovementReportParams,
  TurnoverReportParams,
} from './types.ts';

/**
 * Reports Repository Class
 */
export class ReportsRepository {
  /**
   * Generates inventory valuation report
   */
  async generateValuationReport(
    organizationId: string,
    params: ValuationReportParams
  ): Promise<ValuationReport> {
    // Get summary data
    const summary = await this.getValuationSummary(organizationId, params);

    // Get by category
    const byCategory = await this.getValuationByCategory(organizationId, params);

    // Get by location
    const byLocation = await this.getValuationByLocation(organizationId, params);

    // Get top items by value
    const topItems = await this.getTopItemsByValue(organizationId, 20);

    // Calculate percentages for categories
    const totalValue = summary.totalValue;
    byCategory.forEach((cat) => {
      cat.percentageOfTotal = totalValue > 0 ? (cat.totalValue / totalValue) * 100 : 0;
    });

    return {
      generatedAt: new Date(),
      organizationId,
      currency: 'USD', // Would come from organization settings
      summary,
      byCategory,
      byLocation,
      topItems,
    };
  }

  /**
   * Gets valuation summary
   */
  private async getValuationSummary(
    organizationId: string,
    params: ValuationReportParams
  ): Promise<ValuationSummary> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        COUNT(DISTINCT i.id) as total_items,
        COALESCE(SUM(s.quantity), 0) as total_quantity,
        COALESCE(SUM(s.quantity * i.unit_cost), 0) as total_value,
        COUNT(DISTINCT CASE WHEN COALESCE(s.available_quantity, 0) <= i.reorder_point AND COALESCE(s.available_quantity, 0) > 0 THEN i.id END) as low_stock_items,
        COUNT(DISTINCT CASE WHEN COALESCE(s.available_quantity, 0) = 0 THEN i.id END) as out_of_stock_items
      FROM items i
      LEFT JOIN stock s ON i.id = s.item_id AND s.deleted_at IS NULL
      WHERE i.organization_id = $1 AND i.deleted_at IS NULL AND i.is_active = true`,
      [organizationId]
    );

    const row = result.rows[0]!;
    const totalItems = Number(row.total_items) || 0;
    const totalValue = Number(row.total_value) || 0;

    return {
      totalItems,
      totalQuantity: Number(row.total_quantity) || 0,
      totalValue,
      averageItemValue: totalItems > 0 ? totalValue / totalItems : 0,
      lowStockItems: Number(row.low_stock_items) || 0,
      outOfStockItems: Number(row.out_of_stock_items) || 0,
    };
  }

  /**
   * Gets valuation by category
   */
  private async getValuationByCategory(
    organizationId: string,
    params: ValuationReportParams
  ): Promise<CategoryValuation[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        i.category,
        COUNT(DISTINCT i.id) as item_count,
        COALESCE(SUM(s.quantity), 0) as total_quantity,
        COALESCE(SUM(s.quantity * i.unit_cost), 0) as total_value
      FROM items i
      LEFT JOIN stock s ON i.id = s.item_id AND s.deleted_at IS NULL
      WHERE i.organization_id = $1 AND i.deleted_at IS NULL
      GROUP BY i.category
      ORDER BY total_value DESC`,
      [organizationId]
    );

    return result.rows.map((row) => ({
      category: row.category as string,
      itemCount: Number(row.item_count),
      totalQuantity: Number(row.total_quantity),
      totalValue: Number(row.total_value),
      percentageOfTotal: 0, // Calculated later
    }));
  }

  /**
   * Gets valuation by location
   */
  private async getValuationByLocation(
    organizationId: string,
    params: ValuationReportParams
  ): Promise<LocationValuation[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        l.id as location_id,
        l.name as location_name,
        COUNT(DISTINCT s.item_id) as item_count,
        COALESCE(SUM(s.quantity), 0) as total_quantity,
        COALESCE(SUM(s.quantity * i.unit_cost), 0) as total_value,
        COALESCE(l.capacity_used, 0) as capacity_used
      FROM locations l
      LEFT JOIN stock s ON l.id = s.location_id AND s.deleted_at IS NULL
      LEFT JOIN items i ON s.item_id = i.id
      WHERE l.organization_id = $1 AND l.deleted_at IS NULL
      GROUP BY l.id, l.name, l.capacity_used
      ORDER BY total_value DESC`,
      [organizationId]
    );

    return arrayToCamelCase<LocationValuation>(result.rows);
  }

  /**
   * Gets top items by value
   */
  private async getTopItemsByValue(
    organizationId: string,
    limit: number
  ): Promise<ItemValuation[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        i.id as item_id,
        i.sku,
        i.name,
        i.category,
        COALESCE(SUM(s.quantity), 0) as quantity,
        i.unit_cost,
        COALESCE(SUM(s.quantity), 0) * i.unit_cost as total_value
      FROM items i
      LEFT JOIN stock s ON i.id = s.item_id AND s.deleted_at IS NULL
      WHERE i.organization_id = $1 AND i.deleted_at IS NULL
      GROUP BY i.id, i.sku, i.name, i.category, i.unit_cost
      ORDER BY total_value DESC
      LIMIT $2`,
      [organizationId, limit]
    );

    return arrayToCamelCase<ItemValuation>(result.rows);
  }

  /**
   * Generates movement report
   */
  async generateMovementReport(
    organizationId: string,
    params: MovementReportParams
  ): Promise<MovementReport> {
    // Get summary
    const summary = await this.getMovementSummary(organizationId, params);

    // Get by type
    const byType = await this.getMovementsByType(organizationId, params);

    // Get by item
    const byItem = await this.getMovementsByItem(organizationId, params);

    // Get daily trends
    const dailyTrends = await this.getDailyMovementTrends(organizationId, params);

    return {
      generatedAt: new Date(),
      organizationId,
      dateRange: {
        startDate: params.startDate,
        endDate: params.endDate,
      },
      summary,
      byType,
      byItem,
      byLocation: [], // Similar implementation
      dailyTrends,
    };
  }

  /**
   * Gets movement summary
   */
  private async getMovementSummary(
    organizationId: string,
    params: MovementReportParams
  ): Promise<MovementReportSummary> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        COUNT(*) as total_movements,
        COALESCE(SUM(CASE WHEN type IN ('receipt', 'return') THEN quantity ELSE 0 END), 0) as total_inbound,
        COALESCE(SUM(CASE WHEN type IN ('sale', 'write_off') THEN quantity ELSE 0 END), 0) as total_outbound,
        COALESCE(SUM(CASE WHEN type = 'transfer' THEN quantity ELSE 0 END), 0) as total_transfers,
        COALESCE(SUM(CASE WHEN type = 'adjustment' THEN quantity ELSE 0 END), 0) as total_adjustments
      FROM movements
      WHERE organization_id = $1
        AND created_at >= $2
        AND created_at <= $3
        AND status != 'cancelled'`,
      [organizationId, params.startDate, params.endDate]
    );

    const row = result.rows[0]!;
    const totalInbound = Number(row.total_inbound) || 0;
    const totalOutbound = Number(row.total_outbound) || 0;

    return {
      totalMovements: Number(row.total_movements) || 0,
      totalInbound,
      totalOutbound,
      totalTransfers: Number(row.total_transfers) || 0,
      totalAdjustments: Number(row.total_adjustments) || 0,
      netChange: totalInbound - totalOutbound,
    };
  }

  /**
   * Gets movements by type
   */
  private async getMovementsByType(
    organizationId: string,
    params: MovementReportParams
  ): Promise<MovementTypeSummary[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        type,
        COUNT(*) as count,
        COALESCE(SUM(quantity), 0) as total_quantity,
        COALESCE(SUM(total_value), 0) as total_value
      FROM movements
      WHERE organization_id = $1
        AND created_at >= $2
        AND created_at <= $3
        AND status != 'cancelled'
      GROUP BY type
      ORDER BY count DESC`,
      [organizationId, params.startDate, params.endDate]
    );

    return arrayToCamelCase<MovementTypeSummary>(result.rows);
  }

  /**
   * Gets movements by item
   */
  private async getMovementsByItem(
    organizationId: string,
    params: MovementReportParams
  ): Promise<ItemMovementSummary[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        m.item_id,
        i.sku,
        i.name,
        COALESCE(SUM(CASE WHEN m.type IN ('receipt', 'return') THEN m.quantity ELSE 0 END), 0) as inbound,
        COALESCE(SUM(CASE WHEN m.type IN ('sale', 'write_off') THEN m.quantity ELSE 0 END), 0) as outbound
      FROM movements m
      INNER JOIN items i ON m.item_id = i.id
      WHERE m.organization_id = $1
        AND m.created_at >= $2
        AND m.created_at <= $3
        AND m.status != 'cancelled'
      GROUP BY m.item_id, i.sku, i.name
      ORDER BY (inbound + outbound) DESC
      LIMIT 50`,
      [organizationId, params.startDate, params.endDate]
    );

    return result.rows.map((row) => ({
      itemId: row.item_id as string,
      sku: row.sku as string,
      name: row.name as string,
      inbound: Number(row.inbound),
      outbound: Number(row.outbound),
      netChange: Number(row.inbound) - Number(row.outbound),
    }));
  }

  /**
   * Gets daily movement trends
   */
  private async getDailyMovementTrends(
    organizationId: string,
    params: MovementReportParams
  ): Promise<DailyMovementTrend[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        DATE(created_at) as date,
        COALESCE(SUM(CASE WHEN type IN ('receipt', 'return') THEN quantity ELSE 0 END), 0) as inbound,
        COALESCE(SUM(CASE WHEN type IN ('sale', 'write_off') THEN quantity ELSE 0 END), 0) as outbound
      FROM movements
      WHERE organization_id = $1
        AND created_at >= $2
        AND created_at <= $3
        AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [organizationId, params.startDate, params.endDate]
    );

    return result.rows.map((row) => ({
      date: (row.date as Date).toISOString().split('T')[0],
      inbound: Number(row.inbound),
      outbound: Number(row.outbound),
      netChange: Number(row.inbound) - Number(row.outbound),
    }));
  }

  /**
   * Generates turnover report
   */
  async generateTurnoverReport(
    organizationId: string,
    params: TurnoverReportParams
  ): Promise<TurnoverReport> {
    const daysInPeriod = Math.ceil(
      (params.endDate.getTime() - params.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get item turnovers
    const byItem = await this.getItemTurnover(organizationId, params, daysInPeriod);

    // Calculate summary
    const validTurnovers = byItem.filter((i) => i.turnoverRate > 0);
    const averageTurnoverRate = validTurnovers.length > 0
      ? validTurnovers.reduce((sum, i) => sum + i.turnoverRate, 0) / validTurnovers.length
      : 0;

    // Categorize items
    const slowMoving = byItem.filter((i) => i.turnoverRate < 1).slice(0, 20);
    const fastMoving = byItem.filter((i) => i.turnoverRate >= 4).slice(0, 20);

    // Get by category
    const byCategory = await this.getCategoryTurnover(organizationId, params);

    return {
      generatedAt: new Date(),
      organizationId,
      dateRange: {
        startDate: params.startDate,
        endDate: params.endDate,
      },
      summary: {
        averageTurnoverRate,
        totalItemsAnalyzed: byItem.length,
        slowMovingCount: slowMoving.length,
        fastMovingCount: fastMoving.length,
        daysInPeriod,
      },
      byItem: byItem.slice(0, 100),
      byCategory,
      slowMoving,
      fastMoving,
    };
  }

  /**
   * Gets item turnover rates
   */
  private async getItemTurnover(
    organizationId: string,
    params: TurnoverReportParams,
    daysInPeriod: number
  ): Promise<ItemTurnover[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        i.id as item_id,
        i.sku,
        i.name,
        i.category,
        COALESCE(AVG(s.quantity), 0) as average_inventory,
        COALESCE(SUM(CASE WHEN m.type = 'sale' THEN m.quantity ELSE 0 END), 0) as total_sold
      FROM items i
      LEFT JOIN stock s ON i.id = s.item_id AND s.deleted_at IS NULL
      LEFT JOIN movements m ON i.id = m.item_id
        AND m.created_at >= $2
        AND m.created_at <= $3
        AND m.status != 'cancelled'
      WHERE i.organization_id = $1 AND i.deleted_at IS NULL
      GROUP BY i.id, i.sku, i.name, i.category
      ORDER BY total_sold DESC`,
      [organizationId, params.startDate, params.endDate]
    );

    return result.rows.map((row) => {
      const averageInventory = Number(row.average_inventory) || 0;
      const totalSold = Number(row.total_sold) || 0;
      const turnoverRate = averageInventory > 0 ? (totalSold / averageInventory) * (365 / daysInPeriod) : 0;
      const daysToSell = turnoverRate > 0 ? 365 / turnoverRate : 999;

      return {
        itemId: row.item_id as string,
        sku: row.sku as string,
        name: row.name as string,
        category: row.category as string,
        averageInventory,
        totalSold,
        turnoverRate: Math.round(turnoverRate * 100) / 100,
        daysToSell: Math.round(daysToSell),
      };
    });
  }

  /**
   * Gets category turnover
   */
  private async getCategoryTurnover(
    organizationId: string,
    params: TurnoverReportParams
  ): Promise<CategoryTurnover[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        i.category,
        COUNT(DISTINCT i.id) as item_count,
        COALESCE(SUM(CASE WHEN m.type = 'sale' THEN m.quantity ELSE 0 END), 0) as total_sold
      FROM items i
      LEFT JOIN movements m ON i.id = m.item_id
        AND m.created_at >= $2
        AND m.created_at <= $3
        AND m.status != 'cancelled'
      WHERE i.organization_id = $1 AND i.deleted_at IS NULL
      GROUP BY i.category
      ORDER BY total_sold DESC`,
      [organizationId, params.startDate, params.endDate]
    );

    return result.rows.map((row) => ({
      category: row.category as string,
      itemCount: Number(row.item_count),
      averageTurnoverRate: 0, // Would need more complex calculation
      totalSold: Number(row.total_sold),
    }));
  }
}

// Export singleton instance
export const reportsRepository = new ReportsRepository();

