import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type FeedbackType = 'success' | 'danger' | 'info' | 'warning';

@Component({
  selector: 'app-feedback-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './feedback-modal.component.html',
})
export class FeedbackModalComponent {
  @Input() isOpen = false;
  @Input() title = 'Modal Title';
  @Input() type: FeedbackType = 'info';
  @Input() confirmText = 'Confirm';
  @Input() cancelText = 'Cancel';
  @Input() showCancel = true;
  @Output() closeModal = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  get iconColorClass(): string {
    switch (this.type) {
      case 'success':
        return 'text-green-500';
      case 'danger':
        return 'text-red-500';
      case 'warning':
        return 'text-yellow-500';
      case 'info':
      default:
        return 'text-violet-500';
    }
  }

  get confirmButtonClass(): string {
    switch (this.type) {
      case 'danger':
        return 'bg-red-500 hover:bg-red-600 text-white';
      case 'success':
        return 'bg-green-500 hover:bg-green-600 text-white';
      case 'warning':
        return 'bg-yellow-500 hover:bg-yellow-600 text-white';
      case 'info':
      default:
        return 'bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white';
    }
  }

  onClose(): void {
    this.closeModal.emit();
  }

  onConfirm(): void {
    this.confirm.emit();
  }
}

