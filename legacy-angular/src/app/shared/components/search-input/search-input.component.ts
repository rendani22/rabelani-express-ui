import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <label 
        *ngIf="label" 
        [for]="inputId" 
        class="block text-sm font-medium mb-1 text-gray-600 dark:text-gray-300">
        {{ label }}
      </label>
      <div class="relative">
        <input
          [id]="inputId"
          type="search"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [(ngModel)]="value"
          (ngModelChange)="onValueChange($event)"
          (blur)="onTouched()"
          (keyup.enter)="onSearch()"
          class="w-full rounded-lg border pl-9 pr-3 py-2 text-sm shadow-sm transition-colors
                 bg-white dark:bg-gray-800/30
                 border-gray-200 dark:border-gray-700/60
                 text-gray-800 dark:text-gray-100
                 placeholder:text-gray-400 dark:placeholder:text-gray-500
                 hover:border-gray-300 dark:hover:border-gray-600
                 focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none focus:ring-0"
        />
        <button 
          type="button"
          (click)="onSearch()"
          class="absolute inset-y-0 left-0 flex items-center px-3 group cursor-pointer">
          <svg 
            class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" 
            viewBox="0 0 16 16" 
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor">
            <path d="M7 14c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zM7 2C4.243 2 2 4.243 2 7s2.243 5 5 5 5-2.243 5-5-2.243-5-5-5z"/>
            <path d="M15.707 14.293L13.314 11.9a8.019 8.019 0 01-1.414 1.414l2.393 2.393a.997.997 0 001.414 0 .999.999 0 000-1.414z"/>
          </svg>
        </button>
      </div>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchInputComponent),
      multi: true
    }
  ]
})
export class SearchInputComponent implements ControlValueAccessor {
  @Input() inputId: string = 'search-input-' + Math.random().toString(36).substring(7);
  @Input() label: string = '';
  @Input() placeholder: string = 'Search...';
  @Input() disabled: boolean = false;

  value: string = '';

  onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: string): void {
    this.value = value;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onValueChange(value: string): void {
    this.value = value;
    this.onChange(value);
  }

  onSearch(): void {
    // This can be extended with an EventEmitter for search actions
    console.log('Search triggered:', this.value);
  }
}

