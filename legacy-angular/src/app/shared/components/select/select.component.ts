import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

export interface SelectOption {
  value: string | number;
  label: string;
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <label 
        *ngIf="label" 
        [for]="inputId" 
        class="block text-sm font-medium mb-1 text-gray-600 dark:text-gray-300">
        {{ label }}
        <span *ngIf="required" class="text-red-500">*</span>
      </label>
      <select
        [id]="inputId"
        [disabled]="disabled"
        [required]="required"
        [(ngModel)]="value"
        (ngModelChange)="onValueChange($event)"
        (blur)="onTouched()"
        class="w-full rounded-lg border px-3 py-2 pr-10 text-sm shadow-sm transition-colors
               bg-white dark:bg-gray-800/30
               border-gray-200 dark:border-gray-700/60
               text-gray-800 dark:text-gray-100
               hover:border-gray-300 dark:hover:border-gray-600
               focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none focus:ring-0
               disabled:cursor-not-allowed disabled:bg-gray-100 disabled:border-gray-200 
               disabled:text-gray-400 disabled:dark:bg-gray-800 disabled:dark:border-gray-700 disabled:dark:text-gray-500
               appearance-none
               bg-[url('data:image/svg+xml,%3csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20fill%3D%27none%27%20viewBox%3D%270%200%2020%2020%27%3e%3cpath%20stroke%3D%27%236B7280%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%20stroke-width%3D%271.5%27%20d%3D%27M6%208l4%204%204-4%27%2F%3e%3c%2Fsvg%3e')]
               bg-[length:1.5em_1.5em]
               bg-[right_0.5rem_center]
               bg-no-repeat">
        <option *ngIf="placeholder" value="" disabled>{{ placeholder }}</option>
        <option *ngFor="let option of options" [value]="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true
    }
  ]
})
export class SelectComponent implements ControlValueAccessor {
  @Input() inputId: string = 'select-' + Math.random().toString(36).substring(7);
  @Input() label: string = '';
  @Input() placeholder: string = '';
  @Input() options: SelectOption[] = [];
  @Input() required: boolean = false;
  @Input() disabled: boolean = false;

  value: string | number = '';

  onChange: (value: string | number) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: string | number): void {
    this.value = value;
  }

  registerOnChange(fn: (value: string | number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onValueChange(value: string | number): void {
    this.value = value;
    this.onChange(value);
  }
}

