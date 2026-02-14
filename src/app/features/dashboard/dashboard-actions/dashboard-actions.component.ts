import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilterOption} from '../../../core/models/models';

@Component({
  selector: 'app-dashboard-actions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-actions.component.html',
  styleUrls: ['./dashboard-actions.component.css']
})
export class DashboardActionsComponent {
  @Input() title = 'Dashboard';

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

  filterDropdownOpen = false;

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
    this.addViewClick.emit();
  }
}

