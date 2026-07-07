import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-scrollbar-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scrollbar-modal.component.html',
})
export class ScrollbarModalComponent {
  @Input() isOpen = false;
  @Input() title = 'Modal with Scroll Bar';
  @Input() confirmText = 'I Understand';
  @Input() cancelText = 'Close';
  @Input() maxHeight = '400px';
  @Output() closeModal = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  onClose(): void {
    this.closeModal.emit();
  }

  onConfirm(): void {
    this.confirm.emit();
  }
}

