import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface SearchResult {
  icon?: string;
  text: string;
  subtitle?: string;
  href?: string;
}

@Component({
  selector: 'app-search-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-modal.component.html',
})
export class SearchModalComponent {
  @Input() isOpen = false;
  @Input() placeholder = 'Search Anything…';
  @Input() recentSearches: SearchResult[] = [];
  @Input() recentPages: SearchResult[] = [];
  @Output() closeModal = new EventEmitter<void>();
  @Output() search = new EventEmitter<string>();
  @Output() resultClick = new EventEmitter<SearchResult>();

  searchQuery = '';

  onClose(): void {
    this.closeModal.emit();
  }

  onSearch(): void {
    this.search.emit(this.searchQuery);
  }

  onResultClick(result: SearchResult): void {
    this.resultClick.emit(result);
    this.onClose();
  }
}

