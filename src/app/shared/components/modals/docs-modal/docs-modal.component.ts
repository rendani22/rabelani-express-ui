import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerPackage,
  tablerTruck,
  tablerMapPin,
  tablerUsers,
  tablerClipboardList,
  tablerBell,
  tablerX,
} from '@ng-icons/tabler-icons';

@Component({
  selector: 'app-docs-modal',
  standalone: true,
  imports: [CommonModule, NgIcon],
  viewProviders: [
    provideIcons({
      tablerPackage,
      tablerTruck,
      tablerMapPin,
      tablerUsers,
      tablerClipboardList,
      tablerBell,
      tablerX,
    }),
  ],
  templateUrl: './docs-modal.component.html',
})
export class DocsModalComponent {
  @Input() isOpen = false;
  @Output() closeModal = new EventEmitter<void>();

  onClose(): void {
    this.closeModal.emit();
  }
}
