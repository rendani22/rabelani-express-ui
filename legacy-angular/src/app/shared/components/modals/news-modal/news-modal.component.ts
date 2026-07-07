import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-news-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './news-modal.component.html',
})
export class NewsModalComponent {
  @Input() isOpen = false;
  @Input() title = "Help your team work faster with X 🏃‍♂️";
  @Input() badge = 'New on Mosaic';
  @Input() imageSrc = '';
  @Input() confirmText = 'Cool, I Got it';
  @Output() closeModal = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  onClose(): void {
    this.closeModal.emit();
  }

  onConfirm(): void {
    this.confirm.emit();
  }
}

