/**
 * Alerts Service
 * Business logic layer for alert operations
 */

import { alertsRepository } from './repository.ts';
import type { AuthUser, PaginationParams, PaginatedResult } from '../../core/types/index.ts';
import type {
  Alert,
  AlertWithDetails,
  ThresholdRule,
  AlertFilters,
  AlertSummary,
} from './types.ts';
import type { CreateThresholdInput, UpdateAlertInput } from './validation.ts';
import { createAuditLog, calculateChanges } from '../../core/utils/audit.ts';
import { NotFoundError } from '../../core/errors/index.ts';

/**
 * Alerts Service Class
 */
export class AlertsService {
  /**
   * Gets all alerts with filtering
   */
  async getAlerts(
    user: AuthUser,
    filters: AlertFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<AlertWithDetails>> {
    return await alertsRepository.findAll(
      user.organizationId,
      filters,
      pagination
    );
  }

  /**
   * Gets alert summary for dashboard
   */
  async getAlertSummary(user: AuthUser): Promise<AlertSummary[]> {
    return await alertsRepository.getSummary(user.organizationId);
  }

  /**
   * Creates a new threshold rule for automated alerts
   */
  async createThreshold(
    user: AuthUser,
    input: CreateThresholdInput
  ): Promise<ThresholdRule> {
    const rule = await alertsRepository.createThreshold(
      input,
      user.organizationId,
      user.id
    );

    // Create audit log
    await createAuditLog(
      'alerts',
      'CREATE',
      'threshold_rule',
      rule.id,
      user,
      calculateChanges(null, {
        name: rule.name,
        thresholdType: rule.thresholdType,
        thresholdValue: rule.thresholdValue,
        severity: rule.severity,
      })
    );

    return rule;
  }

  /**
   * Updates an alert's status
   */
  async updateAlert(
    user: AuthUser,
    alertId: string,
    input: UpdateAlertInput
  ): Promise<Alert> {
    const updatedAlert = await alertsRepository.update(
      alertId,
      input,
      user.organizationId,
      user.id
    );

    if (!updatedAlert) {
      throw new NotFoundError('Alert', alertId);
    }

    // Create audit log
    await createAuditLog(
      'alerts',
      'STATUS_CHANGE',
      'alert',
      alertId,
      user,
      calculateChanges(
        { status: 'active' },  // Previous status (simplified)
        { status: input.status }
      ),
      { notes: input.notes }
    );

    return updatedAlert;
  }

  /**
   * Acknowledges an alert
   */
  async acknowledgeAlert(user: AuthUser, alertId: string): Promise<Alert> {
    return await this.updateAlert(user, alertId, { status: 'acknowledged' });
  }

  /**
   * Resolves an alert
   */
  async resolveAlert(user: AuthUser, alertId: string, notes?: string): Promise<Alert> {
    return await this.updateAlert(user, alertId, { status: 'resolved', notes });
  }

  /**
   * Dismisses an alert
   */
  async dismissAlert(user: AuthUser, alertId: string, notes?: string): Promise<Alert> {
    return await this.updateAlert(user, alertId, { status: 'dismissed', notes });
  }
}

// Export singleton instance
export const alertsService = new AlertsService();

