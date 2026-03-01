import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { timer } from 'rxjs';

import {
  CreatePackageRequest,
  Package,
  PackageItemFormValue,
  PackageItemRequest,
  PackageService,
} from '../../../../core';
import { ToastService } from '../../toast/toast.service';

import { CommonModule } from '@angular/common';

/** Duration to show success message before auto-closing */
const SUCCESS_CLOSE_DELAY_MS = 2000;

/** Email validation pattern */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modal component for creating new packages.
 * Uses reactive forms and follows Angular best practices.
 */
@Component({
  selector: 'app-create-package-modal',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './create-package-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePackageModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly packageService = inject(PackageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastService = inject(ToastService);

  // =========================================================================
  // Inputs & Outputs
  // =========================================================================

  /** Controls modal visibility */
  readonly isOpen = input(false);

  /** Emits when modal should close */
  readonly closeModal = output<void>();

  /** Emits the created package on success */
  readonly packageCreated = output<Package>();

  // =========================================================================
  // Form Definition
  // =========================================================================

  /** Main form group */
  readonly form = this.fb.nonNullable.group({
    receiverEmail: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    notes: [''],
    poNumber: [''],
    deliveryLocationId: [''],
    items: this.fb.array<FormGroup>([]),
  });

  /** Typed accessor for items FormArray */
  get itemsArray(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  // =========================================================================
  // UI State
  // =========================================================================

  /** Whether form submission is in progress */
  readonly isSubmitting = signal(false);

  /** Error message to display */
  readonly errorMessage = signal<string | null>(null);

  /** Success message to display */
  readonly successMessage = signal<string | null>(null);

  /** Stores the created package with item IDs from the database */
  readonly createdPackage = signal<Package | null>(null);

  /** Loading state from service */
  readonly isLoading = this.packageService.isLoading;

  /** Form status as a signal (reacts to form validity changes) */
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });

  /** Whether submit button should be disabled */
  readonly isSubmitDisabled = computed(
    () => this.isSubmitting() || this.formStatus() !== 'VALID'
  );

  // =========================================================================
  // Lifecycle
  // =========================================================================

  constructor() {
    // Reset form when modal opens
    effect(() => {
      if (this.isOpen()) {
        this.resetForm();
      }
    });
  }

  // =========================================================================
  // Form Helpers
  // =========================================================================

  /**
   * Creates a new item form group
   */
  private createItemGroup(item?: PackageItemFormValue): FormGroup {
    return this.fb.group({
      quantity: [item?.quantity ?? 1, [Validators.required, Validators.min(1)]],
      description: [item?.description ?? '', Validators.required],
    });
  }

  /**
   * Adds a new item to the items array
   */
  addItem(): void {
    this.itemsArray.push(this.createItemGroup());
  }

  /**
   * Removes an item at the specified index
   */
  removeItem(index: number): void {
    this.itemsArray.removeAt(index);
  }

  /**
   * Resets the form to initial state
   */
  private resetForm(): void {
    this.form.reset();
    this.itemsArray.clear();
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.createdPackage.set(null);
  }

  /**
   * Gets error message for a form control
   */
  getFieldError(fieldName: 'receiverEmail' | 'notes' | 'poNumber'): string | null {
    const control = this.form.controls[fieldName];
    if (!control.touched || control.valid) {
      return null;
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }

    if (control.hasError('pattern')) {
      return 'Please enter a valid email address';
    }

    return null;
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /**
   * Handles modal close action
   */
  onClose(): void {
    this.resetForm();
    this.closeModal.emit();
  }

  /**
   * Handles form submission
   */
  async onSubmit(): Promise<void> {
    // Mark all fields as touched to show validation errors
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    // Reset messages
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.isSubmitting.set(true);

    try {
      const request = this.buildRequest();
      const result = await this.packageService.createPackage(request);

      if (result.success) {
        this.handleSuccess(result.data.package);
      } else {
        this.errorMessage.set(result.error);
      }
    } catch {
      this.errorMessage.set('An unexpected error occurred');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Builds the API request from form values
   */
  private buildRequest(): CreatePackageRequest {
    const { receiverEmail, notes, poNumber, deliveryLocationId, items } =
      this.form.getRawValue();

    // Filter valid items and map to request format
    const validItems: PackageItemRequest[] = items
      .filter((item: Record<string, unknown>) => {
        const desc = item['description'] as string | undefined;
        const qty = item['quantity'] as number | undefined;
        return desc?.trim() && qty && qty > 0;
      })
      .map((item: Record<string, unknown>) => ({
        quantity: item['quantity'] as number,
        description: (item['description'] as string).trim(),
      }));

    // Build request object with all required and optional fields
    return {
      receiver_email: receiverEmail.trim().toLowerCase(),
      ...(notes?.trim() && { notes: notes.trim() }),
      ...(poNumber?.trim() && { po_number: poNumber.trim() }),
      ...(deliveryLocationId?.trim() && { delivery_location_id: deliveryLocationId.trim() }),
      ...(validItems.length > 0 && { items: validItems }),
    };
  }

  /**
   * Handles successful package creation
   */
  private handleSuccess(pkg: Package): void {
    this.successMessage.set(
      `Package created successfully! Reference: ${pkg.reference}`
    );
    this.createdPackage.set(pkg);
    this.packageCreated.emit(pkg);

    // Show success toast notification
    this.toastService.success(`Package created successfully! Reference: ${pkg.reference}`);
  }

  /**
   * Generates QR code data for a specific package item using its database ID
   */
  getCreatedItemQrData(itemId: string): string {
    const pkg = this.createdPackage();
    if (!pkg) return '';

    const item = pkg.items?.find(i => i.id === itemId);
    if (!item) return '';

    return JSON.stringify({
      itemId: item.id,
      packageId: pkg.id,
      packageReference: pkg.reference,
      description: item.description,
      quantity: item.quantity
    });
  }

  /**
   * Prints QR code for a specific created item using its database ID
   */
  printCreatedItemQrCode(itemId: string): void {
    const pkg = this.createdPackage();
    if (!pkg) return;

    const item = pkg.items?.find(i => i.id === itemId);
    if (!item) return;

    // Create a printable window with the QR code
    const printWindow = window.open('', '_blank', 'width=400,height=500');
    if (!printWindow) return;

    const qrData = this.getCreatedItemQrData(itemId);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print QR Code - ${item.description}</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            padding: 20px;
            text-align: center;
          }
          .qr-container {
            border: 2px dashed #ccc;
            padding: 20px;
            margin: 20px auto;
            max-width: 300px;
          }
          .qr-code {
            margin: 10px 0;
          }
          .item-details {
            margin-top: 15px;
            text-align: left;
            font-size: 12px;
          }
          .item-details p {
            margin: 5px 0;
          }
          .item-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .item-id {
            font-size: 10px;
            color: #666;
            font-family: monospace;
          }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="qr-container">
          <div class="item-title">${item.quantity}x ${item.description}</div>
          <img class="qr-code" src="${qrCodeUrl}" alt="QR Code for ${item.description}" />
          <div class="item-details">
            <p><strong>Item ID:</strong> <span class="item-id">${item.id}</span></p>
            <p><strong>Package:</strong> ${pkg.reference}</p>
            <p><strong>Description:</strong> ${item.description}</p>
            <p><strong>Quantity:</strong> ${item.quantity}</p>
          </div>
        </div>
        <button onclick="window.print(); return false;">Print QR Code</button>
      </body>
      </html>
    `);

    printWindow.document.close();
  }

  /**
   * Prints QR codes for all created package items
   */
  printAllCreatedQrCodes(): void {
    const pkg = this.createdPackage();
    if (!pkg || !pkg.items || pkg.items.length === 0) return;

    // Create a printable window with all QR codes
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    // Generate HTML for all items
    const itemsHtml = pkg.items.map((item) => {
      const qrData = this.getCreatedItemQrData(item.id);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;

      return `
        <div class="qr-item">
          <div class="item-title">${item.quantity}x ${item.description}</div>
          <img class="qr-code" src="${qrCodeUrl}" alt="QR Code for ${item.description}" />
          <div class="item-details">
            <p><strong>ID:</strong> <span class="item-id">${item.id}</span></p>
            <p><strong>Qty:</strong> ${item.quantity}</p>
          </div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print All QR Codes - ${pkg.reference}</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            padding: 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #333;
          }
          .header h1 {
            margin: 0 0 10px 0;
            font-size: 20px;
          }
          .header p {
            margin: 5px 0;
            font-size: 12px;
            color: #666;
          }
          .qr-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
          }
          .qr-item {
            border: 2px dashed #ccc;
            padding: 15px;
            text-align: center;
            page-break-inside: avoid;
          }
          .qr-code {
            margin: 10px 0;
          }
          .item-details {
            margin-top: 10px;
            font-size: 11px;
            text-align: left;
          }
          .item-details p {
            margin: 3px 0;
          }
          .item-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .item-id {
            font-size: 9px;
            color: #666;
            font-family: monospace;
          }
          .print-btn {
            display: block;
            margin: 20px auto;
            padding: 10px 20px;
            font-size: 14px;
            cursor: pointer;
          }
          @media print {
            .print-btn { display: none; }
            .qr-item { border: 1px dashed #999; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Package QR Codes</h1>
          <p><strong>Reference:</strong> ${pkg.reference}</p>
          <p><strong>Items:</strong> ${pkg.items.length}</p>
        </div>
        <div class="qr-grid">
          ${itemsHtml}
        </div>
        <button class="print-btn" onclick="window.print(); return false;">Print All QR Codes</button>
      </body>
      </html>
    `);

    printWindow.document.close();
  }
}




