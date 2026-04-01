import { Component, inject, OnInit, OnDestroy, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { DriverMapComponent } from '../../shared/components/map/driver-map.component';
import { UserCardComponent, User, UserCardAction, UserCardMenuOption } from '../../shared/components/user-card';
import { AddDriverModalComponent } from './add-driver-modal/add-driver-modal.component';
import { DriverService, StaffService, DriverProfile, Package, PACKAGE_STATUS } from '../../core';

/**
 * DriversComponent - Main page for driver management and tracking
 *
 * Features:
 * - View all drivers on an interactive map
 * - Track driver locations in real-time
 * - View packages assigned to each driver
 * - Create new driver accounts
 */
@Component({
  selector: 'app-drivers',
  standalone: true,
  imports: [
    CommonModule,
    LayoutComponent,
    DriverMapComponent,
    UserCardComponent,
    AddDriverModalComponent
  ],
  templateUrl: './drivers.html',
  styleUrl: './drivers.css'
})
export class DriversComponent implements OnInit, OnDestroy {
  private readonly driverService = inject(DriverService);
  private readonly staffService = inject(StaffService);

  /** Reference to the map component */
  @ViewChild(DriverMapComponent) mapComponent?: DriverMapComponent;

  /** Refresh interval handle */
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  /** Modal state for adding new driver */
  readonly addDriverModalOpen = signal(false);

  /** Search query for filtering drivers */
  readonly searchQuery = signal('');

  /** View mode: 'map' or 'list' */
  readonly viewMode = signal<'map' | 'list'>('map');

  /** Loading state */
  readonly loading = this.driverService.loading;

  /** Error state */
  readonly error = this.driverService.error;

  /** All drivers */
  readonly drivers = this.driverService.drivers;

  /** Selected driver */
  readonly selectedDriver = this.driverService.selectedDriver;

  /** Selected driver's packages */
  readonly selectedDriverPackages = this.driverService.selectedDriverPackages;

  /** Map markers */
  readonly mapMarkers = this.driverService.mapMarkers;

  /** Whether current user is admin */
  readonly isAdmin = this.staffService.isAdmin;

  /** Menu options for driver cards */
  readonly menuOptions: UserCardMenuOption[] = [
    { label: 'View on Map', action: 'viewOnMap' },
    { label: 'View Packages', action: 'viewPackages' },
    { label: 'Edit', action: 'edit' },
    { label: 'Deactivate', action: 'deactivate', isDanger: true }
  ];

  /** Stats computed from drivers */
  readonly stats = computed(() => {
    const allDrivers = this.drivers();
    return {
      total: allDrivers.length,
      available: this.driverService.availableDriversCount(),
      onDelivery: this.driverService.onDeliveryCount(),
      offline: allDrivers.filter(d => !d.is_active || !d.current_location).length
    };
  });

  /** Filtered drivers based on search */
  readonly filteredDrivers = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const allDrivers = this.drivers();

    if (!query) return allDrivers;

    return allDrivers.filter(d =>
      d.full_name.toLowerCase().includes(query) ||
      d.email.toLowerCase().includes(query) ||
      (d.phone && d.phone.toLowerCase().includes(query))
    );
  });

  /** Driver cards for list view */
  readonly driverCards = computed(() => {
    return this.filteredDrivers().map(driver => this.mapDriverToUser(driver));
  });

  async ngOnInit(): Promise<void> {
    await this.loadDrivers();
    // Refresh every 30 seconds
    this.refreshInterval = setInterval(() => this.refreshData(), 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  /**
   * Load all drivers
   */
  async loadDrivers(): Promise<void> {
    await this.driverService.loadDrivers();
  }

  /**
   * Refresh driver data
   */
  async refreshData(): Promise<void> {
    await this.driverService.refresh();
  }

  /**
   * Refresh just the map (fix tile loading issues)
   */
  onRefreshMap(): void {
    this.mapComponent?.refreshMap();
  }

  /**
   * Handle search input change
   */
  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  /**
   * Toggle view mode between map and list
   */
  toggleViewMode(): void {
    this.viewMode.update(mode => mode === 'map' ? 'list' : 'map');
  }

  /**
   * Handle driver selection from map
   */
  async onDriverSelect(driverId: string): Promise<void> {
    const driver = this.drivers().find(d => d.id === driverId);
    if (driver) {
      await this.driverService.selectDriver(driver);
    }
  }

  /**
   * Handle driver card click
   */
  async onDriverCardClick(user: User): Promise<void> {
    const driver = this.getDriverById(user.id as string);
    if (driver) {
      await this.driverService.selectDriver(driver);
    }
  }

  /**
   * Handle driver card action events
   */
  async onCardAction(action: UserCardAction): Promise<void> {
    const driver = this.getDriverById(action.userId as string);
    if (!driver) return;

    switch (action.actionType) {
      case 'editProfile':
        this.onEditDriver(driver);
        break;
      case 'sendEmail':
        window.location.href = `mailto:${driver.email}`;
        break;
      case 'menuOption':
        await this.handleMenuOption(action.menuOption, driver);
        break;
    }
  }

  /**
   * Handle menu option selection
   */
  private async handleMenuOption(option: string | undefined, driver: DriverProfile): Promise<void> {
    switch (option) {
      case 'viewOnMap':
        this.viewMode.set('map');
        await this.driverService.selectDriver(driver);
        break;
      case 'viewPackages':
        await this.driverService.selectDriver(driver);
        break;
      case 'edit':
        this.onEditDriver(driver);
        break;
      case 'deactivate':
        await this.onDeactivateDriver(driver);
        break;
    }
  }

  /**
   * Open add driver modal
   */
  onAddDriver(): void {
    this.addDriverModalOpen.set(true);
  }

  /**
   * Close add driver modal
   */
  onCloseAddDriverModal(): void {
    this.addDriverModalOpen.set(false);
  }

  /**
   * Handle driver created event
   */
  async onDriverCreated(driver: DriverProfile): Promise<void> {
    console.log('Driver created:', driver);
    await this.loadDrivers();
  }

  /**
   * Edit driver (placeholder)
   */
  onEditDriver(driver: DriverProfile): void {
    console.log('Edit driver:', driver);
    // TODO: Implement edit driver modal
  }

  /**
   * Deactivate driver
   */
  async onDeactivateDriver(driver: DriverProfile): Promise<void> {
    if (confirm(`Are you sure you want to deactivate ${driver.full_name}?`)) {
      await this.staffService.deactivateStaff(driver.id);
      await this.loadDrivers();
    }
  }

  /**
   * Close driver details panel
   */
  onCloseDriverDetails(): void {
    this.driverService.selectDriver(null);
  }

  /**
   * Get driver by ID
   */
  private getDriverById(id: string): DriverProfile | undefined {
    return this.drivers().find(d => d.id === id);
  }

  /**
   * Map driver to User interface for card display
   */
  mapDriverToUser(driver: DriverProfile): User {
    const status = this.getDriverStatusText(driver);
    return {
      id: driver.id,
      name: driver.full_name,
      avatar: driver.avatar_url || this.generateAvatarUrl(driver.full_name),
      country: status,
      countryFlag: this.getStatusEmoji(driver),
      bio: `${driver.email}${driver.phone ? ' • ' + driver.phone : ''}`
    };
  }

  /**
   * Get driver status text
   */
  private getDriverStatusText(driver: DriverProfile): string {
    if (!driver.is_active) return 'Inactive';
    if (!driver.current_location) return 'No Location';

    const lastUpdate = new Date(driver.current_location.updated_at);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    if (lastUpdate < tenMinutesAgo) return 'Offline';
    if (!driver.is_available) return 'On Delivery';
    return 'Available';
  }

  /**
   * Get status emoji
   */
  private getStatusEmoji(driver: DriverProfile): string {
    if (!driver.is_active) return '⚫';
    if (!driver.current_location) return '📍';

    const lastUpdate = new Date(driver.current_location.updated_at);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    if (lastUpdate < tenMinutesAgo) return '⚫';
    if (!driver.is_available) return '🚚';
    return '🟢';
  }

  /**
   * Generate avatar URL from name
   */
  generateAvatarUrl(name: string): string {
    const encodedName = encodeURIComponent(name);
    return `https://ui-avatars.com/api/?name=${encodedName}&background=3b82f6&color=fff&size=128`;
  }

  /**
   * Get package status label
   */
  getPackageStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      [PACKAGE_STATUS.PENDING]: 'Pending',
      [PACKAGE_STATUS.NOTIFIED]: 'Notified',
      [PACKAGE_STATUS.IN_TRANSIT]: 'In Transit',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Ready',
      [PACKAGE_STATUS.DELIVERED]: 'Delivered',
      [PACKAGE_STATUS.COLLECTED]: 'Collected'
    };
    return labels[status] || status;
  }

  /**
   * Track by function for ngFor
   */
  trackByDriverId(index: number, driver: DriverProfile): string {
    return driver.id;
  }

  /**
   * Track by function for packages
   */
  trackByPackageId(index: number, pkg: Package): string {
    return pkg.id;
  }
}



