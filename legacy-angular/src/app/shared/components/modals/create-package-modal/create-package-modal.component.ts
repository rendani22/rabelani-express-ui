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
  GetPurchaseOrderByNumberResult,
  Package,
  PackageItemFormValue,
  PackageItemRequest,
  PACKAGE_STATUS,
  PackageService,
  ReceiverService,
  ReceiverProfile,
  DeliveryLocationService,
  DeliveryLocation,
  InventoryService,
  InventoryItem,
} from '../../../../core';
import { ToastService } from '../../toast/toast.service';
import { ConfirmService, confirmDiscardIfDirty } from '../../confirm-dialog';
import { ClickOutsideDirective } from '../../../directives/outside-click.directive';

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
  imports: [ReactiveFormsModule, CommonModule, ClickOutsideDirective],
  templateUrl: './create-package-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePackageModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly packageService = inject(PackageService);
  private readonly receiverService = inject(ReceiverService);
  private readonly deliveryLocationService = inject(DeliveryLocationService);
  private readonly inventoryService = inject(InventoryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private poLookupRequestSequence = 0;

  // =========================================================================
  // Inputs & Outputs
  // =========================================================================

  /** Controls modal visibility */
  readonly isOpen = input(false);

  /** Emits when modal should close */
  readonly closeModal = output<void>();

  /** Emits the created package on success */
  readonly packageCreated = output<Package>();

  /** Emits an existing duplicate package when the user clicks "View existing order" */
  readonly viewDuplicatePackage = output<Package>();

  // =========================================================================
  // Form Definition
  // =========================================================================

  /** Main form group */
  readonly form = this.fb.nonNullable.group({
    receiverEmail: ['', [Validators.required]],
    notes: [''],
    poNumber: ['', [Validators.required]],
    deliveryLocationId: ['', [Validators.required]],
    items: this.fb.array<FormGroup>([], [Validators.required, Validators.minLength(1)]),
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

  /** Whether this package should be created as a Draft (suppress outgoing communications) */
  readonly isDraft = signal(false);

  /** State of PO lookup flow in PO mode */
  readonly poLookupState = signal<'idle' | 'loading' | 'loaded' | 'not_found'>('idle');

  /** Loaded PO lines and selection state */
  readonly poLines = signal<Array<{
    purchaseOrderItemId: string;
    inventoryItemId: string;
    orderedQuantity: number;
    allocatedQuantity: number;
    remainingQuantity: number;
    selected: boolean;
  }>>([]);

  /** Maps selected PO line IDs to item form row indexes */
  readonly poLineItemIndexes = signal<Record<string, number>>({});

  /** Error message to display */
  readonly errorMessage = signal<string | null>(null);

  /** Success message to display */
  readonly successMessage = signal<string | null>(null);

  /** Stores the created package with item IDs from the database */
  readonly createdPackage = signal<Package | null>(null);

  /** Stores an existing package with the same PO number (duplicate detection) */
  readonly duplicatePackage = signal<Package | null>(null);

  /** Whether the user has chosen to proceed despite a duplicate-PO warning */
  readonly duplicateAcknowledged = signal(false);

  /** Loading state from service */
  readonly isLoading = this.packageService.isLoading;

  /** Search query / displayed text for receiver combobox */
  readonly receiverSearch = signal('');

  /** Whether receiver dropdown is open */
  readonly receiverDropdownOpen = signal(false);

  /** Search query / displayed text for delivery location combobox */
  readonly locationSearch = signal('');

  /** Whether location dropdown is open */
  readonly locationDropdownOpen = signal(false);

  /** Active receivers (filtered by search query when dropdown is open) */
  readonly activeReceivers = computed<ReceiverProfile[]>(() => {
    const list = this.receiverService.receiverList().filter(r => r.is_active);
    if (!this.receiverDropdownOpen()) return list;
    const query = this.receiverSearch().trim().toLowerCase();
    if (!query) return list;
    return list.filter(r =>
      `${r.name} ${r.surname} ${r.email}`.toLowerCase().includes(query)
    );
  });

  /** Loading state for receivers */
  readonly isLoadingReceivers = this.receiverService.loading;

  /** Active delivery locations (filtered by search query when dropdown is open) */
  readonly activeLocations = computed<DeliveryLocation[]>(() => {
    const list = this.deliveryLocationService.locations().filter(l => l.is_active);
    if (!this.locationDropdownOpen()) return list;
    const query = this.locationSearch().trim().toLowerCase();
    if (!query) return list;
    return list.filter(l =>
      `${l.name} ${l.description ?? ''}`.toLowerCase().includes(query)
    );
  });

  /** Loading state for locations */
  readonly isLoadingLocations = this.deliveryLocationService.loading;

  /** Active inventory items for selection in the items section */
  readonly activeInventoryItems = this.inventoryService.activeItems;

  /** Loading state for inventory */
  readonly isLoadingInventory = this.inventoryService.loading;

  /** Per-row search query / displayed text for inventory combobox (keyed by row index) */
  readonly inventorySearches = signal<Record<number, string>>({});

  /** Index of the row whose inventory dropdown is open (null if none) */
  readonly inventoryDropdownOpenIndex = signal<number | null>(null);

  /** Get the current display text for a given inventory combobox row */
  inventorySearchAt(index: number): string {
    return this.inventorySearches()[index] ?? '';
  }

  /** Whether the inventory dropdown for a given row is open */
  isInventoryDropdownOpen(index: number): boolean {
    return this.inventoryDropdownOpenIndex() === index;
  }

  /** Filtered inventory items for a given row based on its search query */
  activeInventoryItemsFor(index: number): InventoryItem[] {
    const list = this.activeInventoryItems();
    if (this.inventoryDropdownOpenIndex() !== index) return list;
    const query = (this.inventorySearches()[index] ?? '').trim().toLowerCase();
    if (!query) return list;
    return list.filter(i =>
      `${i.name} ${i.sku ?? ''}`.toLowerCase().includes(query)
    );
  }

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
        this.inventoryService.loadItems();
      }
    });

    // Clear any stale duplicate-PO warning whenever the user edits the PO
    // number — they're attempting to fix the conflict.
    this.form.controls.poNumber.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const state = this.poLookupState();
        if (state === 'loaded' || state === 'loading') {
          this.clearPoLookupState(true);
        }
        if (this.duplicatePackage()) {
          this.duplicatePackage.set(null);
          this.duplicateAcknowledged.set(false);
          this.errorMessage.set(null);
        }
      });
  }

  // =========================================================================
  // Form Helpers
  // =========================================================================

  /**
   * Loads PO lines for the entered PO number and enables PO subset selection mode.
   */
  async onPoLookup(): Promise<void> {
    const poNumber = this.form.controls.poNumber.value.trim();
    const requestSequence = ++this.poLookupRequestSequence;
    if (!poNumber) {
      this.poLookupState.set('idle');
      this.poLines.set([]);
      return;
    }

    this.poLookupState.set('loading');
    this.poLines.set([]);
    this.poLineItemIndexes.set({});

    let result: GetPurchaseOrderByNumberResult;
    try {
      result = await this.packageService.getPurchaseOrderByNumber(poNumber);
    } catch {
      if (!this.isActivePoLookupResponse(requestSequence, poNumber)) return;
      this.poLookupState.set('not_found');
      return;
    }

    if (!this.isActivePoLookupResponse(requestSequence, poNumber)) return;

    if (!result.success) {
      this.poLookupState.set('not_found');
      return;
    }

    const eligible = result.data.items
      .filter(item => item.remainingQuantity > 0)
      .map(item => ({
        purchaseOrderItemId: item.purchaseOrderItemId,
        inventoryItemId: item.inventoryItemId,
        orderedQuantity: item.orderedQuantity,
        allocatedQuantity: item.allocatedQuantity,
        remainingQuantity: item.remainingQuantity,
        selected: false,
      }));

    if (eligible.length === 0) {
      this.poLookupState.set('not_found');
      return;
    }

    this.itemsArray.clear();
    this.inventorySearches.set({});
    this.inventoryDropdownOpenIndex.set(null);
    this.poLines.set(eligible);
    this.poLookupState.set('loaded');
  }

  /**
   * Selects or unselects a PO line for this order and keeps form rows in sync.
   */
  onPoLineSelectionChange(purchaseOrderItemId: string, selected: boolean): void {
    const line = this.poLines().find(l => l.purchaseOrderItemId === purchaseOrderItemId);
    if (!line) return;

    if (selected) {
      if (line.selected) return;
      this.addItemForPoLine(line);
      return;
    }

    if (!line.selected) return;
    this.removeItemForPoLine(line.purchaseOrderItemId);
  }

  /**
   * Returns the inventory label for a PO line.
   */
  getPoLineLabel(inventoryItemId: string): string {
    const inv = this.activeInventoryItems().find(i => i.id === inventoryItemId);
    if (!inv) {
      return `Inventory item (${inventoryItemId})`;
    }
    return this.getInventoryItemLabel(inv);
  }

  /**
   * Returns a concise description for PO-mapped item rows.
   */
  private getPoLineDescription(inventoryItemId: string): string {
    const inv = this.activeInventoryItems().find(i => i.id === inventoryItemId);
    return inv?.name ?? `PO item (${inventoryItemId})`;
  }

  /**
   * Returns item-level quantity errors, including PO remaining-cap validation.
   */
  getItemError(index: number): string | null {
    const itemGroup = this.itemsArray.at(index) as FormGroup | undefined;
    const quantityControl = itemGroup?.get('quantity');
    if (!quantityControl || !quantityControl.touched) {
      return null;
    }

    if (quantityControl.hasError('required')) {
      return 'Quantity is required';
    }
    if (quantityControl.hasError('min')) {
      return 'Quantity must be at least 1';
    }
    if (quantityControl.hasError('max')) {
      const remaining = quantityControl.getError('max')?.max;
      return `Quantity exceeds remaining PO quantity${remaining ? ` (${remaining})` : ''}`;
    }
    return null;
  }

  /**
   * Whether the item row is locked to a selected PO line.
   */
  isPoMappedRow(index: number): boolean {
    return Object.values(this.poLineItemIndexes()).includes(index);
  }

  /**
   * Creates a new item form group
   */
  private createItemGroup(item?: PackageItemFormValue): FormGroup {
    return this.fb.group({
      inventoryItemId: [item?.inventoryItemId ?? ''],
      quantity: [item?.quantity ?? 1, [Validators.required, Validators.min(1)]],
      description: [item?.description ?? '', Validators.required],
    });
  }

  /**
   * Returns the available stock for an inventory item selected in a specific row.
   */
  getAvailableStock(index: number): number | null {
    const itemGroup = this.itemsArray.at(index) as FormGroup;
    const selectedId = itemGroup?.get('inventoryItemId')?.value as string | undefined;
    if (!selectedId) return null;
    return this.activeInventoryItems().find(i => i.id === selectedId)?.quantity ?? null;
  }

  // ---------------------------------------------------------------------------
  // Inventory combobox (per-row)
  // ---------------------------------------------------------------------------

  /** Open the inventory dropdown for a given row and clear its filter */
  openInventoryDropdown(index: number): void {
    this.setInventorySearch(index, '');
    this.inventoryDropdownOpenIndex.set(index);
  }

  /** Close the inventory dropdown and restore the selected item's label */
  closeInventoryDropdown(index: number): void {
    if (this.inventoryDropdownOpenIndex() !== index) return;
    this.inventoryDropdownOpenIndex.set(null);
    const itemGroup = this.itemsArray.at(index) as FormGroup | undefined;
    const selectedId = itemGroup?.get('inventoryItemId')?.value as string | undefined;
    const selected = selectedId
      ? this.activeInventoryItems().find(i => i.id === selectedId)
      : undefined;
    this.setInventorySearch(index, selected ? this.getInventoryItemLabel(selected) : '');
  }

  /** Toggle the inventory dropdown open state for a row */
  toggleInventoryDropdown(index: number): void {
    if (this.isInventoryDropdownOpen(index)) {
      this.closeInventoryDropdown(index);
    } else {
      this.openInventoryDropdown(index);
    }
  }

  /** Handle typing in the inventory combobox: clears any previous selection */
  onInventoryInput(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.setInventorySearch(index, value);
    this.inventoryDropdownOpenIndex.set(index);
    const itemGroup = this.itemsArray.at(index) as FormGroup;
    if (itemGroup.get('inventoryItemId')?.value) {
      itemGroup.patchValue({ inventoryItemId: '', description: '' });
    }
  }

  /** Select an inventory item from the dropdown for a given row */
  selectInventoryItem(index: number, invItem: InventoryItem | null): void {
    const itemGroup = this.itemsArray.at(index) as FormGroup;
    if (!invItem) {
      itemGroup.patchValue({ inventoryItemId: '', description: '' });
      this.setInventorySearch(index, '');
    } else {
      itemGroup.patchValue({ inventoryItemId: invItem.id, description: invItem.name });
      this.setInventorySearch(index, this.getInventoryItemLabel(invItem));
    }
    this.inventoryDropdownOpenIndex.set(null);
  }

  /** Update the search text for a given row */
  private setInventorySearch(index: number, value: string): void {
    this.inventorySearches.update(map => ({ ...map, [index]: value }));
  }

  /**
   * Adds a new item to the items array and scrolls it into view (within the
   * modal body) so the user doesn't have to scroll down manually.
   */
  addItem(): void {
    if (this.poLookupState() === 'loaded') return;
    this.itemsArray.push(this.createItemGroup());
    const newIndex = this.itemsArray.length - 1;

    // Wait for Angular to render the new row, then scroll the modal body
    // (not the page) so the new item is visible.
    setTimeout(() => {
      const el = document.getElementById(`item-inv-${newIndex}`);
      if (!el) return;

      // Find the closest scroll container (the modal body has overflow-y-auto).
      const container = el.closest('.overflow-y-auto') as HTMLElement | null;
      if (container) {
        const elTop = el.getBoundingClientRect().top;
        const containerTop = container.getBoundingClientRect().top;
        const offset = elTop - containerTop + container.scrollTop - 24;
        container.scrollTo({ top: offset, behavior: 'smooth' });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 0);
  }

  /**
   * Removes an item at the specified index
   */
  removeItem(index: number): void {
    const mappedPoLineId = Object.entries(this.poLineItemIndexes()).find(
      ([, itemIndex]) => itemIndex === index,
    )?.[0];
    if (mappedPoLineId) {
      this.poLines.update(lines => lines.map(line =>
        line.purchaseOrderItemId === mappedPoLineId
          ? { ...line, selected: false }
          : line
      ));
      this.poLineItemIndexes.update(map => {
        const next = { ...map };
        delete next[mappedPoLineId];
        return next;
      });
    }

    this.itemsArray.removeAt(index);
    // Re-key inventory searches: drop the removed index and shift higher indices down.
    this.inventorySearches.update(map => {
      const next: Record<number, string> = {};
      for (const key of Object.keys(map)) {
        const k = Number(key);
        if (k < index) next[k] = map[k];
        else if (k > index) next[k - 1] = map[k];
      }
      return next;
    });
    const openIdx = this.inventoryDropdownOpenIndex();
    if (openIdx === index) {
      this.inventoryDropdownOpenIndex.set(null);
    } else if (openIdx !== null && openIdx > index) {
      this.inventoryDropdownOpenIndex.set(openIdx - 1);
    }
    this.poLineItemIndexes.update(map => {
      const next: Record<string, number> = {};
      for (const [key, idx] of Object.entries(map)) {
        if (idx < index) next[key] = idx;
        else if (idx > index) next[key] = idx - 1;
      }
      return next;
    });
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
    this.duplicatePackage.set(null);
    this.duplicateAcknowledged.set(false);
    this.receiverSearch.set('');
    this.locationSearch.set('');
    this.receiverDropdownOpen.set(false);
    this.locationDropdownOpen.set(false);
    this.inventorySearches.set({});
    this.inventoryDropdownOpenIndex.set(null);
    this.isDraft.set(false);
    this.poLookupState.set('idle');
    this.poLines.set([]);
    this.poLineItemIndexes.set({});
  }

  // ---------------------------------------------------------------------------
  // Receiver combobox
  // ---------------------------------------------------------------------------

  /** Format label for a receiver option */
  private formatReceiverLabel(r: ReceiverProfile): string {
    return `${r.name} ${r.surname} (${r.email})`;
  }

  /** Open receiver dropdown and clear filter so all options show */
  openReceiverDropdown(): void {
    this.receiverSearch.set('');
    this.receiverDropdownOpen.set(true);
  }

  /** Close receiver dropdown and restore display label of selected receiver */
  closeReceiverDropdown(): void {
    if (!this.receiverDropdownOpen()) return;
    this.receiverDropdownOpen.set(false);
    const email = this.form.controls.receiverEmail.value;
    const selected = this.receiverService
      .receiverList()
      .find(r => r.email === email);
    this.receiverSearch.set(selected ? this.formatReceiverLabel(selected) : '');
  }

  /** Handle typing in the receiver combobox: clears any previous selection */
  onReceiverInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.receiverSearch.set(value);
    this.receiverDropdownOpen.set(true);
    if (this.form.controls.receiverEmail.value) {
      this.form.controls.receiverEmail.setValue('');
    }
  }

  /** Select a receiver from the dropdown */
  selectReceiver(receiver: ReceiverProfile): void {
    this.form.controls.receiverEmail.setValue(receiver.email);
    this.form.controls.receiverEmail.markAsTouched();
    this.form.controls.receiverEmail.markAsDirty();
    this.receiverSearch.set(this.formatReceiverLabel(receiver));
    this.receiverDropdownOpen.set(false);
  }

  // ---------------------------------------------------------------------------
  // Location combobox
  // ---------------------------------------------------------------------------

  /** Format label for a location option */
  private formatLocationLabel(l: DeliveryLocation): string {
    return `${l.name}${l.description ? ' – ' + l.description : ''}`;
  }

  /** Open location dropdown and clear filter so all options show */
  openLocationDropdown(): void {
    this.locationSearch.set('');
    this.locationDropdownOpen.set(true);
  }

  /** Close location dropdown and restore display label of selected location */
  closeLocationDropdown(): void {
    if (!this.locationDropdownOpen()) return;
    this.locationDropdownOpen.set(false);
    const id = this.form.controls.deliveryLocationId.value;
    const selected = this.deliveryLocationService
      .locations()
      .find(l => l.id === id);
    this.locationSearch.set(selected ? this.formatLocationLabel(selected) : '');
  }

  /** Handle typing in the location combobox: clears any previous selection */
  onLocationInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.locationSearch.set(value);
    this.locationDropdownOpen.set(true);
    if (this.form.controls.deliveryLocationId.value) {
      this.form.controls.deliveryLocationId.setValue('');
    }
  }

  /** Select a location from the dropdown */
  selectLocation(location: DeliveryLocation): void {
    this.form.controls.deliveryLocationId.setValue(location.id);
    this.form.controls.deliveryLocationId.markAsTouched();
    this.form.controls.deliveryLocationId.markAsDirty();
    this.locationSearch.set(this.formatLocationLabel(location));
    this.locationDropdownOpen.set(false);
  }

  /**
   * Gets error message for a form control
   */
  getFieldError(fieldName: 'receiverEmail' | 'notes' | 'poNumber' | 'deliveryLocationId'): string | null {
    const control = this.form.controls[fieldName];
    if (!control.touched || control.valid) {
      return null;
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }


    return null;
  }

  /**
   * Returns a display label for an inventory item option in the dropdown.
   */
  getInventoryItemLabel(item: InventoryItem): string {
    const skuPart = item.sku ? ` [${item.sku}]` : '';
    const stockPart = item.quantity === 0
      ? ' (out of stock)'
      : ` – ${item.quantity} ${item.unit}`;
    return `${item.name}${skuPart}${stockPart}`;
  }

  /**
   * Handles modal close action. Prompts the user to confirm if the form has
   * unsaved changes. Always allows closing in the success state (after a
   * package was created).
   */
  async onClose(): Promise<void> {
    // Once a package has been successfully created we always allow closing
    // without confirmation (form data is no longer "unsaved").
    if (this.createdPackage()) {
      this.resetForm();
      this.closeModal.emit();
      return;
    }

    const isDirty = this.form.dirty || this.itemsArray.length > 0;
    const proceed = await confirmDiscardIfDirty(
      this.confirmService,
      isDirty,
      this.isSubmitting(),
    );
    if (!proceed) return;

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

      // Duplicate PO number check — warn (non-blocking) the user before
      // creating a new order with a PO number that already exists. The user
      // can still proceed by clicking "Create anyway" or resubmitting.
      if (request.po_number && !this.duplicateAcknowledged()) {
        const existing = await this.packageService.getPackageByPoNumber(
          request.po_number,
        );
        if (existing.success && existing.data) {
          this.duplicatePackage.set(existing.data);
          this.toastService.warning(
            `An order with PO number "${request.po_number}" already exists.`,
          );
          this.isSubmitting.set(false);
          return;
        }
      }

      await this.submitCreate(request);
    } catch {
      this.errorMessage.set('An unexpected error occurred');
      this.isSubmitting.set(false);
    }
  }

  /**
   * Performs the actual package creation. Shared by `onSubmit` and the
   * "Create anyway" override path after a duplicate-PO warning.
   */
  private async submitCreate(request: CreatePackageRequest): Promise<void> {
    try {
      const result = await this.packageService.createPackage(request);

      if (result.success) {
        // Deduct inventory stock for items that came from inventory. Pass the
        // created package reference so inventory movements include a link back
        // to the order for auditing / traceability in Recent Movements.
        await this.deductInventoryStock(result.data.package.reference);
        this.handleSuccess(result.data.package);
      } else {
        this.errorMessage.set(result.error);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * User chose to proceed despite the duplicate-PO warning. Records the
   * acknowledgement and submits the form.
   */
  async onCreateAnyway(): Promise<void> {
    this.duplicateAcknowledged.set(true);
    this.duplicatePackage.set(null);
    await this.onSubmit();
  }

  /**
   * Builds the API request from form values
   */
  private buildRequest(): CreatePackageRequest {
    const { receiverEmail, notes, poNumber, deliveryLocationId, items } =
      this.form.getRawValue();

    const validItemsWithIndex = items
      .map((item: Record<string, unknown>, index) => ({ item, index }))
      .filter(({ item }) => {
        const desc = item['description'] as string | undefined;
        const qty = item['quantity'] as number | undefined;
        return desc?.trim() && qty && qty > 0;
      })
      .map(({ item, index }) => {
        const invId = (item['inventoryItemId'] as string | undefined)?.trim();
        return {
          index,
          quantity: item['quantity'] as number,
          description: (item['description'] as string).trim(),
          ...(invId ? { inventory_item_id: invId } : {}),
        };
      });
    const validItems: PackageItemRequest[] = validItemsWithIndex.map(({ index: _idx, ...item }) => item);

    const validIndexByFormIndex = new Map<number, number>();
    validItemsWithIndex.forEach((entry, validIndex) => {
      validIndexByFormIndex.set(entry.index, validIndex);
    });

    const poAllocations = this.poLines()
      .filter(line => line.selected)
      .map(line => {
        const formIndex = this.poLineItemIndexes()[line.purchaseOrderItemId];
        if (formIndex === undefined) return null;
        const validItemIndex = validIndexByFormIndex.get(formIndex);
        const quantity = Number(items[formIndex]?.['quantity'] ?? 0);
        if (validItemIndex === undefined || quantity <= 0) return null;
        return {
          purchase_order_item_id: line.purchaseOrderItemId,
          item_index: validItemIndex,
          quantity,
        };
      })
      .filter((allocation): allocation is NonNullable<typeof allocation> => allocation !== null);

    // Build request object with all required and optional fields
    return {
      receiver_email: receiverEmail.trim().toLowerCase(),
      ...(notes?.trim() && { notes: notes.trim() }),
      ...(poNumber?.trim() && { po_number: poNumber.trim() }),
      ...(deliveryLocationId?.trim() && { delivery_location_id: deliveryLocationId.trim() }),
      ...(validItems.length > 0 && { items: validItems }),
      ...(poAllocations.length > 0 && { po_allocations: poAllocations }),
      ...(this.isDraft() && { status: PACKAGE_STATUS.DRAFT }),
    };
  }

  /**
   * Adds one form row bound to a PO line and applies remaining-quantity caps.
   */
  private addItemForPoLine(line: {
    purchaseOrderItemId: string;
    inventoryItemId: string;
    remainingQuantity: number;
  }): void {
    const label = this.getPoLineLabel(line.inventoryItemId);
    const itemGroup = this.createItemGroup({
      inventoryItemId: line.inventoryItemId,
      description: this.getPoLineDescription(line.inventoryItemId),
      quantity: 1,
    });
    const quantityControl = itemGroup.get('quantity');
    quantityControl?.setValidators([
      Validators.required,
      Validators.min(1),
      Validators.max(line.remainingQuantity),
    ]);
    quantityControl?.updateValueAndValidity();

    this.itemsArray.push(itemGroup);
    const index = this.itemsArray.length - 1;
    this.setInventorySearch(index, label);
    this.poLineItemIndexes.update(map => ({ ...map, [line.purchaseOrderItemId]: index }));
    this.poLines.update(lines => lines.map(existing =>
      existing.purchaseOrderItemId === line.purchaseOrderItemId
        ? { ...existing, selected: true }
        : existing
    ));
  }

  /**
   * Removes a PO-mapped row by PO line id and reindexes map.
   */
  private removeItemForPoLine(purchaseOrderItemId: string): void {
    const index = this.poLineItemIndexes()[purchaseOrderItemId];
    if (index === undefined) return;
    this.removeItem(index);
  }

  /**
   * Clears PO mode state and optionally clears current item rows.
   */
  private clearPoLookupState(clearItems: boolean): void {
    if (clearItems) {
      this.itemsArray.clear();
      this.inventorySearches.set({});
      this.inventoryDropdownOpenIndex.set(null);
    }
    this.poLookupState.set('idle');
    this.poLines.set([]);
    this.poLineItemIndexes.set({});
  }

  /**
   * Guards state mutations so stale PO lookup responses are ignored.
   */
  private isActivePoLookupResponse(requestSequence: number, poNumber: string): boolean {
    return (
      requestSequence === this.poLookupRequestSequence
      && this.form.controls.poNumber.value.trim() === poNumber
    );
  }

  /**
   * Deducts inventory stock for all form items that have an inventoryItemId selected.
   * Non-fatal: errors do not prevent package creation from succeeding.
   */
  private async deductInventoryStock(packageReference?: string | null): Promise<void> {
    const items = this.form.getRawValue().items as Array<Record<string, unknown>>;
    const deductions = items
      .filter((item) => {
        const id = item['inventoryItemId'] as string | undefined;
        const qty = item['quantity'] as number | undefined;
        return id && qty && qty > 0;
      })
      .map((item) => ({
        inventoryItemId: item['inventoryItemId'] as string,
        quantity: item['quantity'] as number,
      }));

    if (deductions.length > 0) {
      try {
        await this.inventoryService.deductStock(deductions, packageReference ?? undefined);
      } catch {
        this.toastService.warning('Package created, but inventory stock levels could not be updated. Please adjust them manually.');
      }
    }
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
   * Open the existing duplicate order in the details panel.
   * Emits the duplicate package to the parent and closes this modal.
   */
  onViewDuplicate(): void {
    const dup = this.duplicatePackage();
    if (!dup) return;
    this.viewDuplicatePackage.emit(dup);
    this.resetForm();
    this.closeModal.emit();
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

