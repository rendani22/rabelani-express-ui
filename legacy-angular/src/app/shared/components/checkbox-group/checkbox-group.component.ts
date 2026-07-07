import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

export interface CheckboxOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-checkbox-group',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <label 
        *ngIf="groupLabel" 
        class="block text-sm font-medium mb-2 text-gray-600 dark:text-gray-300">
        {{ groupLabel }}
        <span *ngIf="required" class="text-red-500">*</span>
      </label>
      <div class="flex flex-wrap items-center" [class.flex-col]="vertical" [class.items-start]="vertical" [class.gap-3]="vertical" [class.gap-6]="!vertical">
        <label 
          *ngFor="let option of options"
          class="flex items-center cursor-pointer m-3"
          [class.cursor-not-allowed]="option.disabled"
          [class.opacity-50]="option.disabled">
          <input
            type="checkbox"
            [value]="option.value"
            [disabled]="option.disabled"
            [checked]="isSelected(option.value)"
            (change)="onCheckboxChange(option.value, $event)"
            class="w-4 h-4 rounded border shrink-0
                   bg-white dark:bg-gray-800/30
                   border-gray-300 dark:border-gray-700/60
                   text-violet-500
                   focus:ring-0 focus:ring-offset-0
                   checked:bg-violet-500 checked:border-transparent
                   disabled:bg-gray-100 disabled:border-gray-200 
                   disabled:dark:bg-gray-800 disabled:dark:border-gray-700
                   cursor-pointer disabled:cursor-not-allowed"
          />
          <span 
            class="text-sm ml-2 text-gray-700 dark:text-gray-300"
            [class.text-gray-400]="option.disabled"
            [class.dark:text-gray-500]="option.disabled">
            {{ option.label }}
          </span>
        </label>
      </div>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CheckboxGroupComponent),
      multi: true
    }
  ]
})
export class CheckboxGroupComponent implements ControlValueAccessor {
  @Input() groupLabel: string = '';
  @Input() options: CheckboxOption[] = [];
  @Input() required: boolean = false;
  @Input() vertical: boolean = false;
  @Output() selectionChange = new EventEmitter<(string | number)[]>();

  selectedValues: (string | number)[] = [];

  onChange: (value: (string | number)[]) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: (string | number)[]): void {
    this.selectedValues = value || [];
  }

  registerOnChange(fn: (value: (string | number)[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  isSelected(value: string | number): boolean {
    return this.selectedValues.includes(value);
  }

  onCheckboxChange(value: string | number, event: Event): void {
    const checkbox = event.target as HTMLInputElement;

    if (checkbox.checked) {
      this.selectedValues = [...this.selectedValues, value];
    } else {
      this.selectedValues = this.selectedValues.filter(v => v !== value);
    }

    this.onChange(this.selectedValues);
    this.selectionChange.emit(this.selectedValues);
    this.onTouched();
  }
}

