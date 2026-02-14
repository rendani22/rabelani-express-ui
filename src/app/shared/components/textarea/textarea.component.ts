import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-textarea',
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
      <textarea
        [id]="inputId"
        [placeholder]="placeholder"
        [disabled]="disabled"
        [required]="required"
        [rows]="rows"
        [(ngModel)]="value"
        (ngModelChange)="onValueChange($event)"
        (blur)="onTouched()"
        class="w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors resize-y
               bg-white dark:bg-gray-800/30
               border-gray-200 dark:border-gray-700/60
               text-gray-800 dark:text-gray-100
               placeholder:text-gray-400 dark:placeholder:text-gray-500
               hover:border-gray-300 dark:hover:border-gray-600
               focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none focus:ring-0
               disabled:cursor-not-allowed disabled:bg-gray-100 disabled:border-gray-200 
               disabled:text-gray-400 disabled:dark:bg-gray-800 disabled:dark:border-gray-700 disabled:dark:text-gray-500"
        [class.border-red-400]="error"
        [class.border-green-400]="success">
      </textarea>
      
      <!-- Supporting/Error/Success text -->
      <div *ngIf="supportingText" class="text-xs mt-1 text-gray-500 dark:text-gray-400">
        {{ supportingText }}
      </div>
      <div *ngIf="errorText" class="text-xs mt-1 text-red-500">
        {{ errorText }}
      </div>
      <div *ngIf="successText" class="text-xs mt-1 text-green-500">
        {{ successText }}
      </div>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextareaComponent),
      multi: true
    }
  ]
})
export class TextareaComponent implements ControlValueAccessor {
  @Input() inputId: string = 'textarea-' + Math.random().toString(36).substring(7);
  @Input() label: string = '';
  @Input() placeholder: string = '';
  @Input() rows: number = 4;
  @Input() required: boolean = false;
  @Input() disabled: boolean = false;
  @Input() supportingText: string = '';
  @Input() errorText: string = '';
  @Input() successText: string = '';
  @Input() error: boolean = false;
  @Input() success: boolean = false;

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
}

