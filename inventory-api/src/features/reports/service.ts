/**
 * Reports Service
 * Business logic layer for report generation
 */

import { reportsRepository } from './repository.ts';
import type { AuthUser } from '../../core/types/index.ts';
import type {
  ValuationReport,
  MovementReport,
  TurnoverReport,
  ValuationReportParams,
  MovementReportParams,
  TurnoverReportParams,
} from './types.ts';

/**
 * Reports Service Class
 */
export class ReportsService {
  /**
   * Generates inventory valuation report
   * Shows current value of inventory by category, location, and top items
   */
  async generateValuationReport(
    user: AuthUser,
    params: ValuationReportParams = {}
  ): Promise<ValuationReport> {
    return await reportsRepository.generateValuationReport(
      user.organizationId,
      params
    );
  }

  /**
   * Generates movement report
   * Shows stock movements over a date range with trends
   */
  async generateMovementReport(
    user: AuthUser,
    params: MovementReportParams
  ): Promise<MovementReport> {
    // Default to last 30 days if not specified
    const endDate = params.endDate || new Date();
    const startDate = params.startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    return await reportsRepository.generateMovementReport(
      user.organizationId,
      { ...params, startDate, endDate }
    );
  }

  /**
   * Generates turnover report
   * Shows inventory turnover rates to identify slow/fast moving items
   */
  async generateTurnoverReport(
    user: AuthUser,
    params: TurnoverReportParams
  ): Promise<TurnoverReport> {
    // Default to last 90 days for meaningful turnover analysis
    const endDate = params.endDate || new Date();
    const startDate = params.startDate || new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

    return await reportsRepository.generateTurnoverReport(
      user.organizationId,
      { ...params, startDate, endDate }
    );
  }
}

// Export singleton instance
export const reportsService = new ReportsService();

