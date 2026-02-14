import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-basic-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './basic-modal.component.html',
})
export class BasicModalComponent {
  @Input() isOpen = false;
  @Input() title = 'Basic Modal';
  @Input() confirmText = 'I Understand';
  @Input() cancelText = 'Close';
  @Output() closeModal = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  onClose(): void {
    this.closeModal.emit();
  }

  onConfirm(): void {
    this.confirm.emit();
  }
}

