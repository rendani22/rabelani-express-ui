import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-text-input',
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
      <div class="relative">
        <!-- Prefix -->
        <div *ngIf="prefix" class="absolute inset-y-0 left-0 flex items-center pointer-events-none">
          <span class="text-sm text-gray-400 dark:text-gray-500 px-3">{{ prefix }}</span>
        </div>
        
        <!-- Icon -->
        <div *ngIf="icon" class="absolute inset-y-0 left-0 flex items-center pointer-events-none">
          <ng-content select="[prefix-icon]"></ng-content>
        </div>
        
        <input
          [id]="inputId"
          [type]="type"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [required]="required"
          [(ngModel)]="value"
          (ngModelChange)="onValueChange($event)"
          (blur)="onTouched()"
          class="w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors
                 bg-white dark:bg-gray-800/30
                 border-gray-200 dark:border-gray-700/60
                 text-gray-800 dark:text-gray-100
                 placeholder:text-gray-400 dark:placeholder:text-gray-500
                 hover:border-gray-300 dark:hover:border-gray-600
                 focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none focus:ring-0
                 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:border-gray-200 
                 disabled:text-gray-400 disabled:dark:bg-gray-800 disabled:dark:border-gray-700 disabled:dark:text-gray-500"
          [class.pl-12]="prefix"
          [class.pl-9]="icon"
          [class.pr-8]="suffix"
          [class.border-red-400]="error"
          [class.border-green-400]="success"
          [class.py-1]="size === 'small'"
          [class.px-2]="size === 'small'"
          [class.py-3]="size === 'large'"
          [class.px-4]="size === 'large'"
        />
        
        <!-- Suffix -->
        <div *ngIf="suffix" class="absolute inset-y-0 right-0 flex items-center pointer-events-none">
          <span class="text-sm text-gray-400 dark:text-gray-500 px-3">{{ suffix }}</span>
        </div>
      </div>
      
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
      useExisting: forwardRef(() => TextInputComponent),
      multi: true
    }
  ]
})
export class TextInputComponent implements ControlValueAccessor {
  @Input() inputId: string = 'text-input-' + Math.random().toString(36).substring(7);
  @Input() label: string = '';
  @Input() placeholder: string = '';
  @Input() type: string = 'text';
  @Input() prefix: string = '';
  @Input() suffix: string = '';
  @Input() icon: boolean = false;
  @Input() required: boolean = false;
  @Input() disabled: boolean = false;
  @Input() supportingText: string = '';
  @Input() errorText: string = '';
  @Input() successText: string = '';
  @Input() error: boolean = false;
  @Input() success: boolean = false;
  @Input() size: 'small' | 'default' | 'large' = 'default';

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

