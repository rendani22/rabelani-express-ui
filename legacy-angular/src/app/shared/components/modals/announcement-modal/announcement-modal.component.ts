import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-announcement-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './announcement-modal.component.html',
})
export class AnnouncementModalComponent {
  @Input() isOpen = false;
  @Input() title = 'You Unlocked Level 2!';
  @Input() description = 'Semper eget duis at tellus at urna condimentum mattis pellentesque lacus suspendisse faucibus interdum.';
  @Input() iconSrc = 'assets/images/announcement-icon.svg';
  @Input() actionText = 'Claim your Reward ->';
  @Input() dismissText = 'Not Now!';
  @Output() closeModal = new EventEmitter<void>();
  @Output() action = new EventEmitter<void>();

  onClose(): void {
    this.closeModal.emit();
  }

  onAction(): void {
    this.action.emit();
  }
}

