import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

import { Dashboard } from './dashboard';
import { FilterOption, ChartCardData } from '../../core/models/models';
import { Package, PACKAGE_STATUS } from '../../core';

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initial State', () => {
    it('should have createPackageModalOpen set to false initially', () => {
      expect(component.createPackageModalOpen).toBe(false);
    });

    it('should have three chart cards initialized', () => {
      expect(component.chartCards.length).toBe(3);
    });

    it('should have correct chart card data', () => {
      const expectedCards: ChartCardData[] = [
        {
          id: 'dashboard-card-01',
          title: 'Acme Plus',
          subtitle: 'Sales',
          value: '$24,780',
          changePercent: 49
        },
        {
          id: 'dashboard-card-02',
          title: 'Acme Advanced',
          subtitle: 'Sales',
          value: '$17,489',
          changePercent: -14
        },
        {
          id: 'dashboard-card-03',
          title: 'Acme Professional',
          subtitle: 'Sales',
          value: '$9,962',
          changePercent: 29
        }
      ];

      expect(component.chartCards).toEqual(expectedCards);
    });
  });

  describe('onFilterApply', () => {
    it('should log filters when onFilterApply is called', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const filters: FilterOption[] = [
        { label: 'Option 1', checked: true },
        { label: 'Option 2', checked: false }
      ];

      component.onFilterApply(filters);

      expect(consoleSpy).toHaveBeenCalledWith('Filters applied:', filters);
      consoleSpy.mockRestore();
    });
  });

  describe('Modal Operations', () => {
    it('should open create package modal when onAddView is called', () => {
      expect(component.createPackageModalOpen).toBe(false);

      component.onAddView();

      expect(component.createPackageModalOpen).toBe(true);
    });

    it('should close create package modal when onCloseCreatePackageModal is called', () => {
      component.createPackageModalOpen = true;

      component.onCloseCreatePackageModal();

      expect(component.createPackageModalOpen).toBe(false);
    });
  });

  describe('onPackageCreated', () => {
    it('should log the created package', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const mockPackage: Package = {
        id: 'pkg-123',
        reference: 'REF-001',
        receiver_email: 'test@example.com',
        notes: 'Test notes',
        status: PACKAGE_STATUS.PENDING,
        created_at: '2026-02-14T10:00:00Z',
        items: []
      };

      component.onPackageCreated(mockPackage);

      expect(consoleSpy).toHaveBeenCalledWith('Package created:', mockPackage);
      consoleSpy.mockRestore();
    });
  });

  describe('Card Operations', () => {
    it('should log card option selection when onCardOptionSelect is called', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      component.onCardOptionSelect('dashboard-card-01', 'edit');

      expect(consoleSpy).toHaveBeenCalledWith('Card dashboard-card-01 option selected: edit');
      consoleSpy.mockRestore();
    });

    it('should log card removal when onCardRemove is called', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      component.onCardRemove('dashboard-card-01');

      expect(consoleSpy).toHaveBeenCalledWith('Card dashboard-card-01 removed');
      consoleSpy.mockRestore();
    });

    it('should remove card from chartCards array when onCardRemove is called', () => {
      expect(component.chartCards.length).toBe(3);
      expect(component.chartCards.find(c => c.id === 'dashboard-card-01')).toBeDefined();

      component.onCardRemove('dashboard-card-01');

      expect(component.chartCards.length).toBe(2);
      expect(component.chartCards.find(c => c.id === 'dashboard-card-01')).toBeUndefined();
    });

    it('should not affect other cards when removing a specific card', () => {
      component.onCardRemove('dashboard-card-02');

      expect(component.chartCards.length).toBe(2);
      expect(component.chartCards.find(c => c.id === 'dashboard-card-01')).toBeDefined();
      expect(component.chartCards.find(c => c.id === 'dashboard-card-03')).toBeDefined();
    });

    it('should not throw error when removing non-existent card', () => {
      expect(() => component.onCardRemove('non-existent-card')).not.toThrow();
      expect(component.chartCards.length).toBe(3);
    });
  });

  describe('Template Rendering', () => {
    it('should render the app-layout component', () => {
      const layoutElement = fixture.debugElement.query(By.css('app-layout'));
      expect(layoutElement).toBeTruthy();
    });

    it('should render the dashboard actions component', () => {
      const actionsElement = fixture.debugElement.query(By.css('app-dashboard-actions'));
      expect(actionsElement).toBeTruthy();
    });

    it('should render line chart cards for each chart card data', () => {
      const lineChartCards = fixture.debugElement.queryAll(By.css('app-line-chart-card'));
      expect(lineChartCards.length).toBe(3);
    });

    it('should render bar chart card', () => {
      const barChartCard = fixture.debugElement.query(By.css('app-bar-chart-card'));
      expect(barChartCard).toBeTruthy();
    });

    it('should render realtime chart card', () => {
      const realtimeCard = fixture.debugElement.query(By.css('app-realtime-chart-card'));
      expect(realtimeCard).toBeTruthy();
    });

    it('should render doughnut chart card', () => {
      const doughnutCard = fixture.debugElement.query(By.css('app-doughnut-chart-card'));
      expect(doughnutCard).toBeTruthy();
    });

    it('should render top channels table', () => {
      const channelsTable = fixture.debugElement.query(By.css('app-top-channels-table'));
      expect(channelsTable).toBeTruthy();
    });

    it('should render sales over time card', () => {
      const salesCard = fixture.debugElement.query(By.css('app-sales-over-time-card'));
      expect(salesCard).toBeTruthy();
    });

    it('should render sales vs refunds card', () => {
      const salesVsRefundsCard = fixture.debugElement.query(By.css('app-sales-vs-refunds-card'));
      expect(salesVsRefundsCard).toBeTruthy();
    });

    it('should render recent activity card', () => {
      const recentActivityCard = fixture.debugElement.query(By.css('app-recent-activity-card'));
      expect(recentActivityCard).toBeTruthy();
    });

    it('should render income expenses card', () => {
      const incomeExpensesCard = fixture.debugElement.query(By.css('app-income-expenses-card'));
      expect(incomeExpensesCard).toBeTruthy();
    });

    it('should render create package modal', () => {
      const createPackageModal = fixture.debugElement.query(By.css('app-create-package-modal'));
      expect(createPackageModal).toBeTruthy();
    });

    it('should update line chart cards count when a card is removed', async () => {
      component.onCardRemove('dashboard-card-01');
      fixture.detectChanges();
      await fixture.whenStable();

      const lineChartCards = fixture.debugElement.queryAll(By.css('app-line-chart-card'));
      expect(lineChartCards.length).toBe(2);
    });
  });
});
