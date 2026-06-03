import { signal, computed } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { SettingsComponent } from './settings';
import { ThemeService, SettingsService, AuthService, OnboardingTourService, PACKAGE_STATUS, AppSettings } from '../../core';

const defaultSettings: AppSettings = {
  autoRefreshEnabled: true,
  autoRefreshInterval: 30,
  defaultOrdersFilter: 'all',
  defaultDriversView: 'map',
  compactMode: false,
};

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;

  const settingsSignal = signal<AppSettings>(defaultSettings);

  const themeServiceMock = {
    isDarkMode: signal(false),
    currentTheme: signal<'light' | 'dark'>('light'),
    setTheme: vi.fn(),
  };

  const settingsServiceMock = {
    settings: settingsSignal,
    autoRefreshEnabled: computed(() => settingsSignal().autoRefreshEnabled),
    autoRefreshInterval: computed(() => settingsSignal().autoRefreshInterval),
    defaultOrdersFilter: computed(() => settingsSignal().defaultOrdersFilter),
    defaultDriversView: computed(() => settingsSignal().defaultDriversView),
    compactMode: computed(() => settingsSignal().compactMode),
    updateSettings: vi.fn(),
    resetToDefaults: vi.fn().mockImplementation(() => {
      settingsSignal.set(defaultSettings);
    }),
  };

  const authServiceMock = {
    currentUser: signal<{ email: string } | null>({ email: 'admin@example.com' }),
    signOut: vi.fn().mockResolvedValue(undefined),
  };

  const routerMock = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  const onboardingTourMock = {
    restart: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    settingsSignal.set(defaultSettings);

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: ThemeService, useValue: themeServiceMock },
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: OnboardingTourService, useValue: onboardingTourMock },
      ],
    })
      .overrideComponent(SettingsComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose the current user email', () => {
    expect(component.userEmail()).toBe('admin@example.com');
  });

  it('should return empty string when no user is signed in', () => {
    authServiceMock.currentUser.set(null);
    expect(component.userEmail()).toBe('');
    authServiceMock.currentUser.set({ email: 'admin@example.com' });
  });

  it('should initialise local draft fields from service', () => {
    expect(component.autoRefreshEnabled).toBe(true);
    expect(component.autoRefreshInterval).toBe(30);
    expect(component.defaultOrdersFilter).toBe('all');
    expect(component.defaultDriversView).toBe('map');
    expect(component.compactMode).toBe(false);
  });

  it('should expose refresh interval options', () => {
    expect(component.refreshIntervalOptions.length).toBeGreaterThan(0);
    expect(component.refreshIntervalOptions[0]).toHaveProperty('label');
    expect(component.refreshIntervalOptions[0]).toHaveProperty('value');
  });

  it('should expose order filter options', () => {
    expect(component.orderFilterOptions.length).toBeGreaterThan(0);
    expect(component.orderFilterOptions.some(o => o.value === 'all')).toBe(true);
  });

  it('should call setTheme when theme changes', () => {
    component.onThemeChange('dark');
    expect(themeServiceMock.setTheme).toHaveBeenCalledWith('dark');
  });

  it('should call updateSettings with current draft and briefly set saved flag', async () => {
    vi.useFakeTimers();

    component.autoRefreshEnabled = false;
    component.defaultOrdersFilter = 'pending';
    component.onSaveSettings();

    expect(settingsServiceMock.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoRefreshEnabled: false, defaultOrdersFilter: 'pending' })
    );
    expect(component.saved()).toBe(true);

    vi.advanceTimersByTime(2500);
    expect(component.saved()).toBe(false);

    vi.useRealTimers();
  });

  it('should open reset confirmation dialog', () => {
    component.onResetDefaults();
    expect(component.confirmResetOpen()).toBe(true);
  });

  it('should cancel reset dialog', () => {
    component.onResetDefaults();
    component.onCancelReset();
    expect(component.confirmResetOpen()).toBe(false);
    expect(settingsServiceMock.resetToDefaults).not.toHaveBeenCalled();
  });

  it('should confirm reset and re-sync local draft', () => {
    component.autoRefreshEnabled = false;
    component.onResetDefaults();
    component.onConfirmReset();

    expect(settingsServiceMock.resetToDefaults).toHaveBeenCalled();
    expect(component.confirmResetOpen()).toBe(false);
    // After reset the local draft should reflect defaults from the service
    expect(component.autoRefreshEnabled).toBe(defaultSettings.autoRefreshEnabled);
    expect(component.autoRefreshInterval).toBe(defaultSettings.autoRefreshInterval);
  });

  it('should sign out and navigate to login', async () => {
    await component.onSignOut();
    expect(authServiceMock.signOut).toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should navigate to dashboard then restart dashboard tour', async () => {
    vi.useFakeTimers();
    component.onRestartTour();

    await Promise.resolve(); // flush .then()
    vi.advanceTimersByTime(400);

    expect(routerMock.navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(onboardingTourMock.restart).toHaveBeenCalledWith('dashboard');

    vi.useRealTimers();
  });

  it('should navigate to orders then restart orders tour', async () => {
    vi.useFakeTimers();
    component.onRestartOrdersTour();

    await Promise.resolve();
    vi.advanceTimersByTime(500);

    expect(routerMock.navigate).toHaveBeenCalledWith(['/orders']);
    expect(onboardingTourMock.restart).toHaveBeenCalledWith('orders');

    vi.useRealTimers();
  });

  it('should expose the app version', () => {
    expect(component.appVersion).toBeDefined();
  });
});
