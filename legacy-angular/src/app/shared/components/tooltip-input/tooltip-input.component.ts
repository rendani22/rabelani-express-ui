import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tooltip-input',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      <div class="flex items-center justify-between">
        <label 
          *ngIf="label" 
          [for]="inputId" 
          class="block text-sm font-medium mb-1 text-gray-600 dark:text-gray-300">
          {{ label }}
          <span *ngIf="required" class="text-red-500">*</span>
        </label>
        <div class="relative ml-2" (mouseenter)="showTooltip = true" (mouseleave)="showTooltip = false">
          <button 
            type="button"
            class="block focus:outline-none"
            (focus)="showTooltip = true" 
            (blur)="showTooltip = false"
            aria-haspopup="true"
            [attr.aria-expanded]="showTooltip">
            <svg class="w-4 h-4 text-gray-400 dark:text-gray-500 fill-current" viewBox="0 0 16 16">
              <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z"/>
            </svg>
          </button>
          <div 
            *ngIf="showTooltip"
            class="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 min-w-60 
                   bg-gray-800 dark:bg-gray-700 text-gray-200 dark:text-gray-100 
                   text-sm rounded-lg px-3 py-2 shadow-lg
                   animate-fade-in">
            {{ tooltipText }}
          </div>
        </div>
      </div>
      <input
        [id]="inputId"
        [type]="type"
        [placeholder]="placeholder"
        [disabled]="disabled"
        [required]="required"
        [(value)]="value"
        (input)="onInput($event)"
        (blur)="onBlur()"
        class="w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors
               bg-white dark:bg-gray-800/30
               border-gray-200 dark:border-gray-700/60
               text-gray-800 dark:text-gray-100
               placeholder:text-gray-400 dark:placeholder:text-gray-500
               hover:border-gray-300 dark:hover:border-gray-600
               focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none focus:ring-0"
      />
    </div>
  `,
  styles: [`
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translate(-50%, 0.5rem);
      }
      to {
        opacity: 1;
        transform: translate(-50%, 0);
      }
    }
    .animate-fade-in {
      animation: fadeIn 200ms ease-out;
    }
  `]
})
export class TooltipInputComponent {
  @Input() inputId: string = 'tooltip-input-' + Math.random().toString(36).substring(7);
  @Input() label: string = '';
  @Input() tooltipText: string = 'Tooltip information goes here.';
  @Input() placeholder: string = '';
  @Input() type: string = 'text';
  @Input() required: boolean = false;
  @Input() disabled: boolean = false;
  @Input() value: string = '';
  @Output() valueChange = new EventEmitter<string>();
  @Output() blur = new EventEmitter<void>();

  showTooltip: boolean = false;

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.valueChange.emit(this.value);
  }

  onBlur(): void {
    this.blur.emit();
  }
}

