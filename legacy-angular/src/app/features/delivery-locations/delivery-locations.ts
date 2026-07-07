import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerMapPin,
  tablerPlus,
  tablerEdit,
  tablerTrash,
  tablerCheck,
  tablerX,
  tablerSearch,
  tablerRefresh,
} from '@ng-icons/tabler-icons';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { DeliveryLocationService, DeliveryLocation, CreateDeliveryLocationDto, UpdateDeliveryLocationDto } from '../../core';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ConfirmService, confirmDiscardIfDirty } from '../../shared/components/confirm-dialog';

/**
 * Delivery Points management page.
 *
 * Provides full CRUD for the delivery_locations table (UI: "Delivery Points"):
 * create, view, edit (inline), deactivate/reactivate, and delete.
 */
@Component({
  selector: 'app-delivery-locations',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LayoutComponent,
    NgIcon,
    ConfirmDialogComponent,
  ],
  viewProviders: [
    provideIcons({
      tablerMapPin,
      tablerPlus,
      tablerEdit,
      tablerTrash,
      tablerCheck,
      tablerX,
      tablerSearch,
      tablerRefresh,
    }),
  ],
  templateUrl: './delivery-locations.html',
  styleUrl: './delivery-locations.css',
})
export class DeliveryLocationsComponent implements OnInit {
  private readonly locationService = inject(DeliveryLocationService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmService = inject(ConfirmService);

  // =========================================================================
  // State
  // =========================================================================

  readonly locations = this.locationService.locations;
  readonly loading = this.locationService.loading;

  readonly searchQuery = signal('');
  readonly showAddForm = signal(false);
  readonly editingId = signal<string | null>(null);

  // Confirmation dialog
  readonly confirmDeleteOpen = signal(false);
  readonly locationPendingDelete = signal<DeliveryLocation | null>(null);

  readonly filteredLocations = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.locations().filter(
      l => !q ||
        l.name.toLowerCase().includes(q) ||
        (l.description ?? '').toLowerCase().includes(q) ||
        (l.address ?? '').toLowerCase().includes(q)
    );
  });

  // =========================================================================
  // Forms
  // =========================================================================

  readonly addForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: ['', [Validators.required]],
    address: ['', [Validators.required]],
    notes: [''],
    latitude: [null as number | null, [Validators.min(-90), Validators.max(90)]],
    longitude: [null as number | null, [Validators.min(-180), Validators.max(180)]],
  });

  readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: ['', [Validators.required]],
    address: ['', [Validators.required]],
    notes: [''],
    latitude: [null as number | null, [Validators.min(-90), Validators.max(90)]],
    longitude: [null as number | null, [Validators.min(-180), Validators.max(180)]],
  });

  // =========================================================================
  // Lifecycle
  // =========================================================================

  ngOnInit(): void {
    void this.locationService.loadLocations();
  }

  // =========================================================================
  // Add
  // =========================================================================

  onShowAddForm(): void {
    this.addForm.reset();
    this.showAddForm.set(true);
    this.editingId.set(null);
  }

  async onCancelAdd(): Promise<void> {
    const proceed = await confirmDiscardIfDirty(
      this.confirmService,
      this.addForm.dirty,
      false,
    );
    if (!proceed) return;
    this.showAddForm.set(false);
    this.addForm.reset();
  }

  async onSubmitAdd(): Promise<void> {
    this.addForm.markAllAsTouched();
    if (this.addForm.invalid) return;
    if (!this.validateGeoPair(this.addForm)) return;

    const v = this.addForm.getRawValue();
    const dto: CreateDeliveryLocationDto = {
      name: v.name,
      description: v.description || undefined,
      address: v.address || undefined,
      notes: v.notes || undefined,
      latitude: v.latitude ?? undefined,
      longitude: v.longitude ?? undefined,
    };

    const result = await this.locationService.createLocation(dto);

    if (result.error) {
      this.toastService.error(result.error);
    } else {
      this.toastService.success(`Delivery point "${result.location!.name}" created successfully!`);
      // Close without prompting — form was just saved.
      this.showAddForm.set(false);
      this.addForm.reset();
    }
  }

  // =========================================================================
  // Edit
  // =========================================================================

  onStartEdit(loc: DeliveryLocation): void {
    this.editingId.set(loc.id);
    this.showAddForm.set(false);
    this.editForm.patchValue({
      name: loc.name,
      description: loc.description ?? '',
      address: loc.address ?? '',
      notes: loc.notes ?? '',
      latitude: loc.latitude ?? null,
      longitude: loc.longitude ?? null,
    });
  }

  async onCancelEdit(): Promise<void> {
    const proceed = await confirmDiscardIfDirty(
      this.confirmService,
      this.editForm.dirty,
      false,
    );
    if (!proceed) return;
    this.editingId.set(null);
    this.editForm.reset();
  }

  async onSubmitEdit(loc: DeliveryLocation): Promise<void> {
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) return;
    if (!this.validateGeoPair(this.editForm)) return;

    const v = this.editForm.getRawValue();
    const dto: UpdateDeliveryLocationDto = {
      name: v.name,
      description: v.description || undefined,
      address: v.address || undefined,
      notes: v.notes || undefined,
      latitude: v.latitude ?? undefined,
      longitude: v.longitude ?? undefined,
    };

    const result = await this.locationService.updateLocation(loc.id, dto);

    if (result.error) {
      this.toastService.error(result.error);
    } else {
      this.toastService.success(`Delivery point "${result.location!.name}" updated.`);
      // Close without prompting — form was just saved.
      this.editingId.set(null);
      this.editForm.reset();
    }
  }

  // =========================================================================
  // Activate / Deactivate
  // =========================================================================

  async onToggleActive(loc: DeliveryLocation): Promise<void> {
    if (loc.is_active) {
      const result = await this.locationService.deactivateLocation(loc.id);
      if (result.error) {
        this.toastService.error(result.error);
      } else {
        this.toastService.success(`Delivery point "${loc.name}" deactivated.`);
      }
    } else {
      const result = await this.locationService.reactivateLocation(loc.id);
      if (result.error) {
        this.toastService.error(result.error);
      } else {
        this.toastService.success(`Delivery point "${loc.name}" reactivated.`);
      }
    }
  }

  // =========================================================================
  // Delete
  // =========================================================================

  onDeleteRequest(loc: DeliveryLocation): void {
    this.locationPendingDelete.set(loc);
    this.confirmDeleteOpen.set(true);
  }

  async onConfirmDelete(): Promise<void> {
    this.confirmDeleteOpen.set(false);
    const loc = this.locationPendingDelete();
    this.locationPendingDelete.set(null);
    if (!loc) return;

    const result = await this.locationService.deleteLocation(loc.id);
    if (result.error) {
      this.toastService.error(result.error);
    } else {
      this.toastService.success(`Delivery point "${loc.name}" deleted.`);
    }
  }

  onCancelDelete(): void {
    this.confirmDeleteOpen.set(false);
    this.locationPendingDelete.set(null);
  }

  // =========================================================================
  // Search / Refresh
  // =========================================================================

  onSearchChange(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  async onRefresh(): Promise<void> {
    await this.locationService.loadLocations();
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  getAddFieldError(field: string): string | null {
    return this.getFormFieldError(this.addForm, field);
  }

  getEditFieldError(field: string): string | null {
    return this.getFormFieldError(this.editForm, field);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getFormFieldError(form: { get(field: string): AbstractControl | null }, field: string): string | null {
    const ctrl = form.get(field);
    if (!ctrl || !ctrl.touched || !ctrl.errors) return null;
    if (ctrl.errors['required']) return 'This field is required.';
    if (ctrl.errors['minlength']) return `Must be at least ${ctrl.errors['minlength'].requiredLength} characters.`;
    if (ctrl.errors['min']) return `Must be ≥ ${ctrl.errors['min'].min}.`;
    if (ctrl.errors['max']) return `Must be ≤ ${ctrl.errors['max'].max}.`;
    return null;
  }

  /**
   * Latitude and longitude must be supplied together (or both empty).
   */
  private validateGeoPair(form: { get(field: string): AbstractControl | null }): boolean {
    const lat = form.get('latitude')?.value;
    const lng = form.get('longitude')?.value;
    const latSet = lat !== null && lat !== undefined && lat !== ('' as unknown);
    const lngSet = lng !== null && lng !== undefined && lng !== ('' as unknown);
    if (latSet !== lngSet) {
      this.toastService.warning('Please provide both latitude and longitude, or leave both empty.');
      return false;
    }
    return true;
  }

  trackById(_index: number, loc: DeliveryLocation): string {
    return loc.id;
  }
}
