import { Injectable, signal, computed } from '@angular/core';

const SETTINGS_STORAGE_KEY = 'app-settings';

export type DefaultOrdersFilter =
  | 'all'
  | 'draft'
  | 'pending'
  | 'notified'
  | 'in_transit'
  | 'ready_for_collection'
  | 'collected'
  | 'delivered'
  | 'returned';
export type DefaultDriversView = 'map' | 'list';

export interface AppSettings {
  readonly autoRefreshEnabled: boolean;
  readonly autoRefreshInterval: number; // seconds
  readonly defaultOrdersFilter: DefaultOrdersFilter;
  readonly defaultDriversView: DefaultDriversView;
  readonly compactMode: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  autoRefreshEnabled: true,
  autoRefreshInterval: 30,
  defaultOrdersFilter: 'all',
  defaultDriversView: 'map',
  compactMode: false,
};

/**
 * Service responsible for managing application-wide user preferences.
 * Settings are persisted to localStorage and exposed as read-only signals.
 */
@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private readonly _settings = signal<AppSettings>(this.loadSettings());

  /** Read-only snapshot of all settings */
  readonly settings = this._settings.asReadonly();

  // Individual computed accessors for convenience
  readonly autoRefreshEnabled = computed(() => this._settings().autoRefreshEnabled);
  readonly autoRefreshInterval = computed(() => this._settings().autoRefreshInterval);
  readonly autoRefreshIntervalMs = computed(() => this._settings().autoRefreshInterval * 1000);
  readonly defaultOrdersFilter = computed(() => this._settings().defaultOrdersFilter);
  readonly defaultDriversView = computed(() => this._settings().defaultDriversView);
  readonly compactMode = computed(() => this._settings().compactMode);

  /**
   * Update one or more settings and persist them.
   */
  updateSettings(patch: Partial<AppSettings>): void {
    this._settings.update(current => ({ ...current, ...patch }));
    this.persistSettings();
  }

  /**
   * Reset all settings to their defaults.
   */
  resetToDefaults(): void {
    this._settings.set({ ...DEFAULT_SETTINGS });
    this.persistSettings();
  }

  private loadSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!stored) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(stored) as Partial<AppSettings>;
      // Merge with defaults so new settings added in future don't break
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private persistSettings(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this._settings()));
    } catch {
      // Storage unavailable, fail silently
    }
  }
}
