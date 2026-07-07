/**
 * Severity types for Banner, Toast, and Notification components
 */
export type AlertSeverity = 'warning' | 'success' | 'error' | 'info';

/**
 * Style variant for alerts
 */
export type AlertVariant = 'solid' | 'soft' | 'outlined';

/**
 * Base configuration for alert-style components
 */
export interface AlertConfig {
  severity: AlertSeverity;
  message: string;
  dismissible?: boolean;
  autoClose?: boolean;
  autoCloseDelay?: number;
}

/**
 * Configuration for Banner component
 */
export interface BannerConfig extends AlertConfig {
  variant?: 'solid' | 'soft';
}

/**
 * Configuration for Toast component
 */
export interface ToastConfig extends AlertConfig {
  variant?: AlertVariant;
}

/**
 * Configuration for Notification component
 */
export interface NotificationConfig extends AlertConfig {
  title: string;
  actionLabel?: string;
  actionUrl?: string;
}

