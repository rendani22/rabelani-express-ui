import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-newsletter-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './newsletter-modal.component.html',
})
export class NewsletterModalComponent {
  @Input() isOpen = false;
  @Input() title = 'Subscribe to the Newsletter!';
  @Input() description = 'Semper eget duis at tellus at urna condimentum mattis pellentesque lacus suspendisse faucibus interdum.';
  @Input() submitText = 'Subscribe';
  @Input() privacyNote = "I respect your privacy. No spam. Unsubscribe at any time!";
  @Output() closeModal = new EventEmitter<void>();
  @Output() subscribe = new EventEmitter<string>();

  email = '';

  onClose(): void {
    this.closeModal.emit();
  }

  onSubmit(): void {
    this.subscribe.emit(this.email);
  }
}

