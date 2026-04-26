import {
  Component,
  inject,
  input,
  output,
  signal,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerUser,
  tablerPhone,
  tablerUsers,
  tablerPlus,
  tablerTrash,
  tablerX,
} from '@ng-icons/tabler-icons';

import {
  ReceiverService,
  ReceiverProfile,
  ReceiverContact,
  CreateReceiverContactDto,
} from '../../../../core';
import { ConfirmService, confirmDiscardIfDirty } from '../../confirm-dialog';

/**
 * Modal for managing alternative contact people for a receiver profile.
 * Each contact has a name and phone number.
 */
@Component({
  selector: 'app-manage-contacts-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgIcon],
  templateUrl: './manage-contacts-modal.component.html',
  styleUrl: './manage-contacts-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({
      tablerUser,
      tablerPhone,
      tablerUsers,
      tablerPlus,
      tablerTrash,
      tablerX,
    }),
  ],
})
export class ManageContactsModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly receiverService = inject(ReceiverService);
  private readonly confirmService = inject(ConfirmService);

  /** Controls modal visibility */
  readonly isOpen = input(false);

  /** Receiver whose contacts are being managed */
  readonly receiver = input<ReceiverProfile | null>(null);

  /** Emits when modal should close */
  readonly closeModal = output<void>();

  /** Add-contact form */
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.minLength(6)]],
  });

  // UI state
  readonly contacts = signal<ReceiverContact[]>([]);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    // Reload contacts whenever the modal opens for a receiver.
    effect(() => {
      const open = this.isOpen();
      const receiver = this.receiver();
      if (open && receiver) {
        void this.loadContacts(receiver.id);
      } else if (!open) {
        this.contacts.set([]);
        this.errorMessage.set(null);
        this.form.reset();
      }
    });
  }

  getFieldError(fieldName: 'name' | 'phone'): string | null {
    const control = this.form.get(fieldName);
    if (!control || !control.touched || !control.errors) return null;
    if (control.errors['required']) {
      return fieldName === 'name' ? 'Name is required' : 'Phone is required';
    }
    if (control.errors['minlength']) {
      const min = control.errors['minlength'].requiredLength;
      return `Must be at least ${min} characters`;
    }
    return null;
  }

  private async loadContacts(receiverId: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const { contacts, error } = await this.receiverService.loadContacts(receiverId);
    if (error) this.errorMessage.set(error);
    this.contacts.set(contacts);
    this.isLoading.set(false);
  }

  async onAdd(): Promise<void> {
    const receiver = this.receiver();
    if (!receiver) return;

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const { name, phone } = this.form.getRawValue();
    const dto: CreateReceiverContactDto = {
      receiver_id: receiver.id,
      name: name.trim(),
      phone: phone.trim(),
    };
    const { contact, error } = await this.receiverService.addContact(dto);

    this.isSubmitting.set(false);

    if (error || !contact) {
      this.errorMessage.set(error ?? 'Failed to add contact.');
      return;
    }

    this.contacts.update((list) => [...list, contact]);
    this.form.reset();
  }

  async onDelete(contact: ReceiverContact): Promise<void> {
    this.deletingId.set(contact.id);
    this.errorMessage.set(null);
    const { success, error } = await this.receiverService.deleteContact(contact.id);
    this.deletingId.set(null);
    if (!success) {
      this.errorMessage.set(error ?? 'Failed to delete contact.');
      return;
    }
    this.contacts.update((list) => list.filter((c) => c.id !== contact.id));
  }

  async onClose(): Promise<void> {
    if (this.isSubmitting() || this.deletingId()) return;
    // Only consider the inline add-contact draft as "unsaved": persisted
    // contacts in the list are saved/deleted immediately.
    const { name, phone } = this.form.getRawValue();
    const draftDirty = !!(name?.trim() || phone?.trim());
    const proceed = await confirmDiscardIfDirty(
      this.confirmService,
      draftDirty,
      false,
    );
    if (!proceed) return;
    this.closeModal.emit();
  }

  trackById(_index: number, contact: ReceiverContact): string {
    return contact.id;
  }
}

