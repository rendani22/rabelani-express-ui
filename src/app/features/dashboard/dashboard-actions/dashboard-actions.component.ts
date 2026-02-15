import { Component, Input, Output, EventEmitter, AfterViewInit, ViewChild, ElementRef, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilterOption} from '../../../core/models/models';
import { BannerService } from '../../../shared/components/banner/banner.service';
import flatpickr from 'flatpickr';
import { Instance } from 'flatpickr/dist/types/instance';

@Component({
  selector: 'app-dashboard-actions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-actions.component.html',
  styleUrls: ['./dashboard-actions.component.css']
})
export class DashboardActionsComponent implements AfterViewInit, OnDestroy {
  private readonly bannerService = inject(BannerService);

  @Input() title = 'Dashboard';
  @ViewChild('datepicker') datepickerInput!: ElementRef<HTMLInputElement>;

  private flatpickrInstance: Instance | null = null;

  @Input() filterOptions: FilterOption[] = [
    { label: 'Direct VS Indirect', checked: true },
    { label: 'Real Time Value', checked: true },
    { label: 'Top Channels', checked: true },
    { label: 'Sales VS Refunds', checked: false },
    { label: 'Last Order', checked: false },
    { label: 'Total Spent', checked: false }
  ];

  @Output() addViewClick = new EventEmitter<void>();
  @Output() filterApply = new EventEmitter<FilterOption[]>();
  @Output() dateChange = new EventEmitter<{ start: Date; end?: Date }>();

  filterDropdownOpen = false;

  ngAfterViewInit(): void {
    this.flatpickrInstance = flatpickr(this.datepickerInput.nativeElement, {
      mode: 'range',
      dateFormat: 'M j, Y',
      defaultDate: [new Date(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)],
      animate: true,
      position: 'auto right',
      onChange: (selectedDates) => {
        if (selectedDates.length > 0) {
          this.dateChange.emit({
            start: selectedDates[0],
            end: selectedDates[1]
          });
        }
      }
    });
  }

  ngOnDestroy(): void {
    if (this.flatpickrInstance) {
      this.flatpickrInstance.destroy();
    }
  }

  toggleFilterDropdown(): void {
    this.filterDropdownOpen = !this.filterDropdownOpen;
  }

  closeFilterDropdown(): void {
    this.filterDropdownOpen = false;
  }

  toggleFilter(index: number): void {
    this.filterOptions[index].checked = !this.filterOptions[index].checked;
  }

  clearFilters(): void {
    this.filterOptions.forEach(opt => opt.checked = false);
  }

  applyFilters(): void {
    this.filterApply.emit([...this.filterOptions]);
    this.closeFilterDropdown();
  }

  onAddView(): void {
    // const bannerId = this.bannerService.info('This is a test banner message!', { autoClose: true, autoCloseDelay: 5000 });
    this.addViewClick.emit();
  }
}

