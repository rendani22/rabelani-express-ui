import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ConfirmService, confirmDiscardIfDirty } from '../../confirm-dialog';

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

  private readonly confirmService = inject(ConfirmService);

  formData: FeedbackFormData = {
    name: '',
    email: '',
    message: '',
  };

  async onClose(): Promise<void> {
    const isDirty = !!(
      this.formData.name?.trim() ||
      this.formData.email?.trim() ||
      this.formData.message?.trim()
    );
    const proceed = await confirmDiscardIfDirty(this.confirmService, isDirty, false);
    if (!proceed) return;
    this.closeModal.emit();
  }

  onSubmit(): void {
    this.submit.emit(this.formData);
  }
}

