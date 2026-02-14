import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-toggle-switch',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex items-center">
      <div class="relative select-none w-11" [class.opacity-50]="disabled">
        <input
          type="checkbox"
          [id]="inputId"
          [disabled]="disabled"
          [(ngModel)]="checked"
          (ngModelChange)="onCheckedChange($event)"
          class="sr-only peer"
        />
        <label
          [for]="inputId"
          class="block h-6 rounded-full cursor-pointer transition-colors duration-200
                 bg-gray-400 dark:bg-gray-700
                 peer-checked:bg-violet-500
                 peer-disabled:cursor-not-allowed peer-disabled:bg-gray-200 peer-disabled:border peer-disabled:border-gray-200
                 peer-disabled:dark:bg-gray-700/20 peer-disabled:dark:border-gray-700/60">
          <span 
            class="absolute block w-5 h-5 top-0.5 left-0.5 bg-white rounded-full shadow-sm transition-all duration-150 ease-out"
            [class.translate-x-5]="checked"
            [class.bg-gray-400]="disabled"
            [class.dark:bg-gray-600]="disabled"
            aria-hidden="true">
          </span>
          <span class="sr-only">{{ label || 'Toggle switch' }}</span>
        </label>
      </div>
      <div 
        *ngIf="showLabel"
        class="text-sm ml-2 italic text-gray-500 dark:text-gray-400"
        [class.text-gray-400]="disabled">
        {{ disabled ? 'Disabled' : (checked ? onLabel : offLabel) }}
      </div>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ToggleSwitchComponent),
      multi: true
    }
  ]
})
export class ToggleSwitchComponent implements ControlValueAccessor {
  @Input() inputId: string = 'toggle-' + Math.random().toString(36).substring(7);
  @Input() label: string = '';
  @Input() onLabel: string = 'On';
  @Input() offLabel: string = 'Off';
  @Input() showLabel: boolean = true;
  @Input() disabled: boolean = false;
  @Output() checkedChange = new EventEmitter<boolean>();

  checked: boolean = false;

  onChange: (value: boolean) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: boolean): void {
    this.checked = value;
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onCheckedChange(value: boolean): void {
    this.checked = value;
    this.onChange(value);
    this.checkedChange.emit(value);
    this.onTouched();
  }
}

