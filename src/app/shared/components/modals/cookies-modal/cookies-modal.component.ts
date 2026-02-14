import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cookies-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cookies-modal.component.html',
})
export class CookiesModalComponent {
  @Input() isOpen = false;
  @Input() title = 'We use cookies 🍪';
  @Input() acceptText = 'I Accept';
  @Input() declineText = 'Decline';
  @Output() closeModal = new EventEmitter<void>();
  @Output() accept = new EventEmitter<void>();
  @Output() decline = new EventEmitter<void>();

  onClose(): void {
    this.closeModal.emit();
  }

  onAccept(): void {
    this.accept.emit();
  }

  onDecline(): void {
    this.decline.emit();
  }
}

