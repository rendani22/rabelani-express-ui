import { Injectable, signal, computed } from '@angular/core';
import { AlertSeverity } from '../shared/alert.types';

/** Banner variant type (only solid and soft are supported) */
export type BannerVariant = 'solid' | 'soft';

/**
 * Interface for a banner item managed by the BannerService
 */
export interface BannerItem {
  id: string;
  severity: AlertSeverity;
  message: string;
  variant: BannerVariant;
  autoClose: boolean;
  autoCloseDelay: number;
}

/**
 * Banner Service
 *
 * A service for managing banners programmatically.
 * Allows showing and dismissing banners from anywhere in the application.
 *
 * @example
 * ```typescript
 * export class MyComponent {
 *   private bannerService = inject(BannerService);
 *
 *   showWarning() {
 *     this.bannerService.warning('System maintenance scheduled for tonight.');
 *   }
 *
 *   showError() {
 *     this.bannerService.error('Service temporarily unavailable.');
 *   }
 * }
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class BannerService {
  private readonly _banners = signal<BannerItem[]>([]);

  /** Observable list of current banners */
  readonly banners = computed(() => this._banners());

  /** Counter for generating unique IDs */
  private idCounter = 0;

  /**
   * Show a banner
   */
  show(
    message: string,
    severity: AlertSeverity = 'info',
    options?: {
      variant?: BannerVariant;
      autoClose?: boolean;
      autoCloseDelay?: number;
    }
  ): string {
    const id = `banner-${++this.idCounter}`;
    const banner: BannerItem = {
      id,
      message,
      severity,
      variant: options?.variant ?? 'solid',
      autoClose: options?.autoClose ?? false,
      autoCloseDelay: options?.autoCloseDelay ?? 10000,
    };

    this._banners.update(banners => [...banners, banner]);
    console.log('[BannerService] Banner added:', banner, 'Total banners:', this._banners().length);

    if (banner.autoClose) {
      setTimeout(() => {
        this.dismiss(id);
      }, banner.autoCloseDelay);
    }

    return id;
  }

  /**
   * Show a success banner
   */
  success(message: string, options?: { variant?: BannerVariant; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(message, 'success', { autoClose: true, ...options });
  }

  /**
   * Show an error banner
   */
  error(message: string, options?: { variant?: BannerVariant; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(message, 'error', { autoClose: false, ...options });
  }

  /**
   * Show a warning banner
   */
  warning(message: string, options?: { variant?: BannerVariant; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(message, 'warning', options);
  }

  /**
   * Show an info banner
   */
  info(message: string, options?: { variant?: BannerVariant; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(message, 'info', options);
  }

  /**
   * Dismiss a specific banner by ID
   */
  dismiss(id: string): void {
    this._banners.update(banners => banners.filter(b => b.id !== id));
  }

  /**
   * Dismiss all banners
   */
  dismissAll(): void {
    this._banners.set([]);
  }
}







