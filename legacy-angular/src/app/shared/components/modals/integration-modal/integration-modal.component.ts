import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface IntegrationPermission {
  text: string;
}

@Component({
  selector: 'app-integration-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './integration-modal.component.html',
})
export class IntegrationModalComponent {
  @Input() isOpen = false;
  @Input() title = 'Connect Mosaic with your account';
  @Input() permissions: IntegrationPermission[] = [];
  @Input() privacyNote = '';
  @Input() privacyLinkText = 'Privacy Policy';
  @Input() privacyLinkHref = '#';
  @Input() confirmText = 'Allow Access';
  @Input() cancelText = 'Cancel';
  @Output() closeModal = new EventEmitter<void>();
  @Output() allowAccess = new EventEmitter<void>();

  onClose(): void {
    this.closeModal.emit();
  }

  onAllow(): void {
    this.allowAccess.emit();
  }
}

