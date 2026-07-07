import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-radio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <label class="flex items-center cursor-pointer" [class.cursor-not-allowed]="disabled" [class.opacity-50]="disabled">
      <input
        type="radio"
        [id]="inputId"
        [name]="name"
        [value]="radioValue"
        [disabled]="disabled"
        [checked]="checked"
        (change)="onRadioChange()"
        class="w-4 h-4 rounded-full border shrink-0
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
        *ngIf="label" 
        class="text-sm ml-2 text-gray-700 dark:text-gray-300"
        [class.text-gray-400]="disabled"
        [class.dark:text-gray-500]="disabled">
        {{ label }}
      </span>
    </label>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RadioComponent),
      multi: true
    }
  ]
})
export class RadioComponent implements ControlValueAccessor {
  @Input() inputId: string = 'radio-' + Math.random().toString(36).substring(7);
  @Input() name: string = 'radio-group';
  @Input() label: string = '';
  @Input() radioValue: string | number = '';
  @Input() disabled: boolean = false;
  @Output() radioChange = new EventEmitter<string | number>();

  value: string | number = '';
  checked: boolean = false;

  onChange: (value: string | number) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: string | number): void {
    this.value = value;
    this.checked = this.value === this.radioValue;
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

  onRadioChange(): void {
    this.value = this.radioValue;
    this.checked = true;
    this.onChange(this.radioValue);
    this.radioChange.emit(this.radioValue);
    this.onTouched();
  }
}

