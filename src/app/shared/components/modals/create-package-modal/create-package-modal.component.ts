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
  ReceiverService,
  ReceiverProfile,
  DeliveryLocationService,
  DeliveryLocation,
} from '../../../../core';
import { ToastService } from '../../toast/toast.service';

import { CommonModule } from '@angular/common';

/** Duration to show success message before auto-closing */
const SUCCESS_CLOSE_DELAY_MS = 2000;


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
  private readonly receiverService = inject(ReceiverService);
  private readonly deliveryLocationService = inject(DeliveryLocationService);
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
    receiverEmail: ['', [Validators.required]],
    notes: [''],
    poNumber: ['', [Validators.required]],
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

  /** Active receivers for the dropdown */
  readonly activeReceivers = computed<ReceiverProfile[]>(() =>
    this.receiverService.receiverList().filter(r => r.is_active)
  );

  /** Loading state for receivers */
  readonly isLoadingReceivers = this.receiverService.loading;

  /** Active delivery locations for the dropdown */
  readonly activeLocations = computed<DeliveryLocation[]>(() =>
    this.deliveryLocationService.locations().filter(l => l.is_active)
  );

  /** Loading state for locations */
  readonly isLoadingLocations = this.deliveryLocationService.loading;

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
    // Reset form and reload lookup data when modal opens
    effect(() => {
      if (this.isOpen()) {
        this.resetForm();
        this.receiverService.loadAllReceivers();
        this.deliveryLocationService.loadLocations();
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
   * Optimized for AIMO D520 Thermal Label Printer with 2.25" x 4" labels (57mm x 102mm)
   */
  printCreatedItemQrCode(itemId: string): void {
    const pkg = this.createdPackage();
    if (!pkg) return;

    const item = pkg.items?.find(i => i.id === itemId);
    if (!item) return;

    // Create a printable window with the QR code
    const printWindow = window.open('', '_blank', 'width=280,height=450');
    if (!printWindow) return;

    const qrData = this.getCreatedItemQrData(itemId);
    // QR code at 170px for good scanning on 57mm wide label
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(qrData)}`;

    // Truncate item ID for display (show first 8 and last 4 chars)
    const shortId = item.id.length > 14 ? `${item.id.slice(0, 8)}...${item.id.slice(-4)}` : item.id;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Print QR Code - ${item.description}</title>
        <style>
          /*
           * AIMO D520 Thermal Label Printer
           * Label: 2.25" x 4" (57mm x 102mm)
           */
          @page {
            size: 2.25in 4in;
            margin: 0 !important;
            padding: 0 !important;
          }
          @media print {
            html, body {
              width: 2.25in !important;
              height: 4in !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            .print-btn, .print-instructions {
              display: none !important;
            }
            .label {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 2.25in !important;
              height: 4in !important;
              margin: 0 !important;
              padding: 0.1in !important;
              border: none !important;
              box-shadow: none !important;
            }
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 2.25in;
            height: 4in;
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .label {
            width: 2.25in;
            height: 4in;
            padding: 0.1in;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            background: white;
          }
          .package-ref {
            font-weight: bold;
            font-size: 11pt;
            text-align: center;
            width: 100%;
            padding-bottom: 0.05in;
            margin-bottom: 0.05in;
            border-bottom: 1px solid #000;
          }
          .item-title {
            font-size: 9pt;
            font-weight: bold;
            text-align: center;
            line-height: 1.2;
            margin-bottom: 0.08in;
            max-height: 0.5in;
            overflow: hidden;
            width: 100%;
          }
          .qr-code {
            width: 1.7in;
            height: 1.7in;
            margin: 0.05in 0;
          }
          .item-id {
            font-family: 'Courier New', monospace;
            font-size: 7pt;
            color: #333;
            text-align: center;
            margin-top: 0.05in;
          }
          .qty-badge {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 0.08in 0.2in;
            font-size: 14pt;
            font-weight: bold;
            margin-top: 0.1in;
          }
          .print-btn {
            position: fixed;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 16px;
            font-size: 14px;
            cursor: pointer;
            z-index: 1000;
          }
          .print-instructions {
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: #fffbe6;
            border: 1px solid #faad14;
            padding: 10px 15px;
            border-radius: 4px;
            font-size: 12px;
            max-width: 300px;
            z-index: 1000;
          }
          @media screen {
            body {
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background: #f0f0f0;
              padding: 60px 20px;
            }
            .label {
              border: 1px dashed #999;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
          }
        </style>
      </head>
      <body>
        <div class="print-instructions">
          <strong>Printer Settings:</strong><br>
          1. Select AIMO D520 printer<br>
          2. Paper size: <strong>2.25 x 4 in</strong><br>
          3. Scale: <strong>100%</strong> (not "Fit to page")<br>
          4. Margins: <strong>None</strong>
        </div>
        <div class="label">
          <div class="package-ref">${pkg.reference}</div>
          <div class="item-title">${item.description}</div>
          <img class="qr-code" src="${qrCodeUrl}" alt="QR Code" />
          <div class="item-id">${shortId}</div>
          <div class="qty-badge">QTY: ${item.quantity}</div>
        </div>
        <button class="print-btn" onclick="window.print(); return false;">Print Label</button>
      </body>
      </html>
    `);

    printWindow.document.close();
  }

  /**
   * Prints QR codes for all created package items
   * Optimized for AIMO D520 Thermal Label Printer with 2.25" x 4" labels (57mm x 102mm)
   */
  printAllCreatedQrCodes(): void {
    const pkg = this.createdPackage();
    if (!pkg || !pkg.items || pkg.items.length === 0) return;

    // Create a printable window with all QR codes
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    // Generate HTML for all items - each item on its own label page
    const itemsHtml = pkg.items.map((item) => {
      const qrData = this.getCreatedItemQrData(item.id);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(qrData)}`;
      const shortId = item.id.length > 14 ? `${item.id.slice(0, 8)}...${item.id.slice(-4)}` : item.id;

      return `
        <div class="label">
          <div class="package-ref">${pkg.reference}</div>
          <div class="item-title">${item.description}</div>
          <img class="qr-code" src="${qrCodeUrl}" alt="QR Code" />
          <div class="item-id">${shortId}</div>
          <div class="qty-badge">QTY: ${item.quantity}</div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Print All QR Codes - ${pkg.reference}</title>
        <style>
          /*
           * AIMO D520 Thermal Label Printer
           * Label: 2.25" x 4" (57mm x 102mm)
           */
          @page {
            size: 2.25in 4in;
            margin: 0 !important;
            padding: 0 !important;
          }
          @media print {
            html, body {
              width: 2.25in !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .screen-header, .print-btn, .print-instructions {
              display: none !important;
            }
            .labels-container {
              display: block !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .label {
              position: relative !important;
              width: 2.25in !important;
              height: 4in !important;
              margin: 0 !important;
              padding: 0.1in !important;
              border: none !important;
              box-shadow: none !important;
              page-break-after: always;
              page-break-inside: avoid;
            }
            .label:last-child {
              page-break-after: auto;
            }
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .label {
            width: 2.25in;
            height: 4in;
            padding: 0.1in;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            background: white;
          }
          .package-ref {
            font-weight: bold;
            font-size: 11pt;
            text-align: center;
            width: 100%;
            padding-bottom: 0.05in;
            margin-bottom: 0.05in;
            border-bottom: 1px solid #000;
          }
          .item-title {
            font-size: 9pt;
            font-weight: bold;
            text-align: center;
            line-height: 1.2;
            margin-bottom: 0.08in;
            max-height: 0.5in;
            overflow: hidden;
            width: 100%;
          }
          .qr-code {
            width: 1.7in;
            height: 1.7in;
            margin: 0.05in 0;
          }
          .item-id {
            font-family: 'Courier New', monospace;
            font-size: 7pt;
            color: #333;
            text-align: center;
            margin-top: 0.05in;
          }
          .qty-badge {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 0.08in 0.2in;
            font-size: 14pt;
            font-weight: bold;
            margin-top: 0.1in;
          }
          .screen-header {
            text-align: center;
            padding: 20px;
            border-bottom: 2px solid #333;
            margin-bottom: 20px;
            background: #f5f5f5;
          }
          .screen-header h1 {
            margin: 0 0 10px 0;
            font-size: 20px;
          }
          .screen-header p {
            margin: 5px 0;
            font-size: 12px;
            color: #666;
          }
          .print-instructions {
            background: #fffbe6;
            border: 1px solid #faad14;
            padding: 15px;
            border-radius: 4px;
            margin: 10px auto;
            max-width: 400px;
            font-size: 13px;
          }
          .print-instructions strong {
            display: block;
            margin-bottom: 8px;
          }
          .print-instructions ol {
            margin-left: 20px;
          }
          .print-instructions li {
            margin: 5px 0;
          }
          .labels-container {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            justify-content: center;
            padding: 20px;
          }
          .print-btn {
            display: block;
            margin: 20px auto;
            padding: 12px 24px;
            font-size: 16px;
            cursor: pointer;
            background: #1890ff;
            color: white;
            border: none;
            border-radius: 4px;
          }
          .print-btn:hover {
            background: #40a9ff;
          }
          @media screen {
            .label {
              border: 1px dashed #999;
              margin: 10px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
          }
        </style>
      </head>
      <body>
        <div class="screen-header">
          <h1>Package QR Code Labels</h1>
          <p><strong>Reference:</strong> ${pkg.reference}</p>
          <p><strong>Total Labels:</strong> ${pkg.items.length}</p>

          <div class="print-instructions">
            <strong>⚠️ Printer Settings:</strong>
            <ol>
              <li>Select <strong>AIMO D520</strong> as printer</li>
              <li>Set Paper Size to <strong>2.25 x 4 in</strong></li>
              <li>Set Scale to <strong>100%</strong> (not "Fit to page")</li>
              <li>Set Margins to <strong>None</strong></li>
            </ol>
          </div>
        </div>
        <div class="labels-container">
          ${itemsHtml}
        </div>
        <button class="print-btn" onclick="window.print(); return false;">🖨️ Print All Labels</button>
      </body>
      </html>
    `);

    printWindow.document.close();
  }
}




