import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface FeedbackFormData {
  name: string;
  email: string;
  message: string;
}

@Component({
  selector: 'app-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './form-modal.component.html',
})
export class FormModalComponent {
  @Input() isOpen = false;
  @Input() title = 'Send Feedback';
  @Input() submitText = 'Send';
  @Input() cancelText = 'Cancel';
  @Output() closeModal = new EventEmitter<void>();
  @Output() submit = new EventEmitter<FeedbackFormData>();

  formData: FeedbackFormData = {
    name: '',
    email: '',
    message: '',
  };

  onClose(): void {
    this.closeModal.emit();
  }

  onSubmit(): void {
    this.submit.emit(this.formData);
  }
}

