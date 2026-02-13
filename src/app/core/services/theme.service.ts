import { Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';

const THEME_STORAGE_KEY = 'dark-mode';

export type Theme = 'light' | 'dark';

/**
 * Service responsible for managing application theme (light/dark mode)
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  /** Current theme signal */
  readonly currentTheme = signal<Theme>(this.getStoredTheme());

  /** Whether dark mode is enabled */
  readonly isDarkMode = signal<boolean>(this.getStoredTheme() === 'dark');

  constructor() {
    this.applyTheme(this.currentTheme());
  }

  /**
   * Toggle between light and dark theme
   */
  toggleTheme(): void {
    const newTheme: Theme = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  /**
   * Set a specific theme
   */
  setTheme(theme: Theme): void {
    this.currentTheme.set(theme);
    this.isDarkMode.set(theme === 'dark');
    this.applyTheme(theme);
    this.storeTheme(theme);
  }

  /**
   * Initialize theme from storage (call on app init or component init)
   */
  initializeTheme(): void {
    const storedTheme = this.getStoredTheme();
    this.applyTheme(storedTheme);
  }

  private applyTheme(theme: Theme): void {
    const htmlElement = this.document.documentElement;

    if (theme === 'dark') {
      htmlElement.classList.add('dark');
      htmlElement.style.colorScheme = 'dark';
    } else {
      htmlElement.classList.remove('dark');
      htmlElement.style.colorScheme = 'light';
    }
  }

  private getStoredTheme(): Theme {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored === 'true' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  private storeTheme(theme: Theme): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme === 'dark' ? 'true' : 'false');
    } catch {
      // Storage unavailable, fail silently
    }
  }
}

