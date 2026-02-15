import { Component, Input, Output, EventEmitter, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PACKAGE_STATUS } from '../../../core';
import { ClickOutsideDirective } from '../../../shared/directives/outside-click.directive';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

/** Status filter option */
interface StatusOption {
  value: string;
  label: string;
}

/**
 * Orders actions component for filtering, searching, and adding packages.
 */
@Component({
  selector: 'app-orders-actions',
  standalone: true,
  imports: [CommonModule, FormsModule, ClickOutsideDirective],
  templateUrl: './orders-actions.component.html',
  styleUrls: ['./orders-actions.component.css']
})
export class OrdersActionsComponent implements OnDestroy {
  @Input() title = 'Orders';

  @Output() searchChange = new EventEmitter<string>();
  @Output() statusFilterChange = new EventEmitter<string>();
  @Output() addPackageClick = new EventEmitter<void>();
  @Output() refreshClick = new EventEmitter<void>();

  /** Search input value */
  searchTerm = signal('');

  /** Selected status filter */
  selectedStatus = signal('all');

  /** Status dropdown open state */
  statusDropdownOpen = signal(false);

  /** Status filter options */
  readonly statusOptions: StatusOption[] = [
    { value: 'all', label: 'All Statuses' },
    { value: PACKAGE_STATUS.PENDING, label: 'Pending' },
    { value: PACKAGE_STATUS.NOTIFIED, label: 'Notified' },
    { value: PACKAGE_STATUS.IN_TRANSIT, label: 'In Transit' },
    { value: PACKAGE_STATUS.READY_FOR_COLLECTION, label: 'Ready for Collection' },
    { value: PACKAGE_STATUS.DELIVERED, label: 'Delivered' },
    { value: PACKAGE_STATUS.COLLECTED, label: 'Collected' }
  ];

  /** Search debounce subject */
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor() {
    // Debounce search input
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(term => {
      this.searchChange.emit(term);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Handle search input change.
   */
  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm.set(target.value);
    this.searchSubject.next(target.value);
  }

  /**
   * Clear search input.
   */
  clearSearch(): void {
    this.searchTerm.set('');
    this.searchSubject.next('');
  }

  /**
   * Toggle status dropdown.
   */
  toggleStatusDropdown(): void {
    this.statusDropdownOpen.update(open => !open);
  }

  /**
   * Close status dropdown.
   */
  closeStatusDropdown(): void {
    this.statusDropdownOpen.set(false);
  }

  /**
   * Select a status filter option.
   */
  selectStatus(value: string): void {
    this.selectedStatus.set(value);
    this.statusFilterChange.emit(value);
    this.closeStatusDropdown();
  }

  /**
   * Get display label for current status.
   */
  getSelectedStatusLabel(): string {
    const option = this.statusOptions.find(opt => opt.value === this.selectedStatus());
    return option?.label ?? 'All Statuses';
  }

  /**
   * Handle add package button click.
   */
  onAddPackage(): void {
    this.addPackageClick.emit();
  }

  /**
   * Handle refresh button click.
   */
  onRefresh(): void {
    this.refreshClick.emit();
  }
}


