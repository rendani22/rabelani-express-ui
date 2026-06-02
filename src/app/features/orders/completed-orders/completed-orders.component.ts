import { Component, inject, signal, computed, OnInit, ApplicationRef, EnvironmentInjector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LayoutComponent } from '../../../shared/components/layout/layout.component';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { tablerArrowLeft, tablerPackage } from '@ng-icons/tabler-icons';
import { PackageService, PACKAGE_STATUS, Package, MarkCollectedPayload, generatePodPdfBase64, createZip, ZipEntry } from '../../../core';
import { ToastService } from '../../../shared/components/toast';
import { OrdersFileSystemViewComponent } from '../orders-file-system-view/orders-file-system-view';
import { PackageDetailsPanelComponent } from '../../../shared/components/modals';

@Component({
  selector: 'app-completed-orders',
  standalone: true,
  imports: [CommonModule, RouterLink, LayoutComponent, OrdersFileSystemViewComponent, PackageDetailsPanelComponent, NgIcon],
  viewProviders: [
    provideIcons({ tablerArrowLeft, tablerPackage })
  ],
  templateUrl: './completed-orders.component.html',
  styleUrls: ['./completed-orders.component.css']
})
export class CompletedOrdersComponent implements OnInit{
  private readonly packageService = inject(PackageService);
  // File-system view only (table view removed)
  // Details panel state for viewing a package from the filesystem view
  selectedPackage = signal<Package | null>(null);
  detailsPanelOpen = signal(false);

  readonly startDate = signal<string>('');
  readonly endDate = signal<string>('');
  readonly selectedIds = signal<Set<string>>(new Set());

  // Human-friendly selection count for UI
  readonly selectionCount = computed(() => this.selectedIds().size);
  readonly selectionLabel = computed(() => {
    const c = this.selectionCount();
    return c === 0 ? '' : c === 1 ? '1 item selected' : `${c} items selected`;
  });

  readonly isLoading = this.packageService.isLoading;
  readonly error = this.packageService.error;
  readonly packages = this.packageService.packages;
  readonly bulkDownloading = signal(false);
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly toastService = inject(ToastService);

  async ngOnInit(): Promise<void> {
    // Default date range: last 7 days (input type=date expects yyyy-MM-dd)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const end = `${yyyy}-${mm}-${dd}`;

    const startDateObj = new Date(today);
    startDateObj.setDate(startDateObj.getDate() - 7);
    const sY = startDateObj.getFullYear();
    const sM = String(startDateObj.getMonth() + 1).padStart(2, '0');
    const sD = String(startDateObj.getDate()).padStart(2, '0');
    const start = `${sY}-${sM}-${sD}`;

    this.startDate.set(start);
    this.endDate.set(end);

    // Load packages and let the component filter client-side
    await this.packageService.loadPackages();
  }

  async refresh(): Promise<void> {
    await this.packageService.loadPackages();
  }

  onStartDateChange(event: Event): void {
    const v = (event.target as HTMLInputElement)?.value ?? '';
    this.startDate.set(v);
  }

  onEndDateChange(event: Event): void {
    const v = (event.target as HTMLInputElement)?.value ?? '';
    this.endDate.set(v);
  }

  onPackageSelected(pkg: Package): void {
    if (!pkg) return;
    this.selectedPackage.set(pkg);
    this.detailsPanelOpen.set(true);
  }

  onCloseDetailsPanel(): void {
    this.detailsPanelOpen.set(false);
    this.selectedPackage.set(null);
  }

  /** Download POD PDF blobs for selected packages. Attempts to fetch stored pdf_url first, falls back to generating the POD PDF client-side when possible. */
  async bulkDownloadPODs(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    console.debug('[CompletedOrders] bulkDownloadPODs selected ids=', ids);
    if (ids.length === 0) return;

    this.bulkDownloading.set(true);
    try {
      const entries: ZipEntry[] = [];
      for (const id of ids) {
        let pkg = this.packageService.packages().find(p => p.id === id);
        if (!pkg) {
          console.debug('[CompletedOrders] package not found in cache for id, fetching from API', id);
          const res = await this.packageService.getPackage(id);
          if (res.success) {
            pkg = res.data;
          } else {
            console.debug('[CompletedOrders] getPackage failed for id', id, res);
            continue;
          }
        }

        // Try to get a stored PDF URL first
        const lock = await this.packageService.getPackageLockStatus(id);
        if (lock && lock.pdfUrl) {
          try {
            const resp = await fetch(lock.pdfUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              const filename = `POD-${pkg.reference}${pkg.po_number ? `-${pkg.po_number}` : ''}.pdf`;
              entries.push({ name: filename, data: blob });
              continue;
            }
          } catch (err) {
            console.warn('[CompletedOrders] Failed to fetch pdfUrl for', id, err);
          }
        }

        // Fallback: ensure a POD row exists (create a minimal/stub POD if
        // missing) and then generate PDF client-side
        const pod = await this.packageService.ensurePodExists(id);
        if (pod) {
          const payload: MarkCollectedPayload = {
            receiver: {
              name: pod.receiver_name ?? '',
              employee_number: pod.receiver_employee_number ?? '',
              phone: pod.receiver_phone ?? '',
              signature_data_url: pod.receiver_signature ?? ''
            },
            witness: {
              name: pod.witness_name ?? '',
              employee_number: pod.witness_employee_number ?? '',
              phone: pod.witness_phone ?? '',
              signature_data_url: pod.witness_signature ?? ''
            },
            collected_at: pod.completed_at ?? new Date().toISOString()
          };

          const res = await generatePodPdfBase64(pkg, payload, this.appRef, this.environmentInjector);
          if (res.base64) {
            const blob = this.base64ToBlob(res.base64, 'application/pdf');
            const filename = `POD-${pkg.reference}${pkg.po_number ? `-${pkg.po_number}` : ''}.pdf`;
            entries.push({ name: filename, data: blob });
            continue;
          } else {
            console.warn('[CompletedOrders] Failed to generate POD PDF for', id, res.error);
          }
        }

        // If we reach here we couldn't obtain a PDF; skip with a warning
        console.warn('[CompletedOrders] No POD available for package', id);
      }

      console.debug('[CompletedOrders] collected entries count=', entries.length);
      if (entries.length === 0) {
        console.warn('[CompletedOrders] No POD files were collected for zip creation');
        this.toastService.warning('No POD files were found for the selected packages. If you expected PODs to exist, check the SELECT RLS policies on `public.pods`.');
      } else {
        const now = new Date();
        const fileName = `pods-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.zip`;
        try {
          const zipBlob = await createZip(entries);
          this.saveBlob(zipBlob, fileName);
          this.toastService.success(`Downloaded ${entries.length} POD(s) as ${fileName}`);
        } catch (err) {
          console.error('[CompletedOrders] Failed to create ZIP of PODs', err);
          // Fallback: save individually if zip creation fails
          for (const e of entries) {
            if (e.data instanceof Blob) this.saveBlob(e.data, e.name);
          }
        }
      }
    } finally {
      this.bulkDownloading.set(false);
      // Clear selection after download
      this.selectedIds.set(new Set());
    }
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private base64ToBlob(base64: string, mime: string): Blob {
    const binary = atob(base64);
    const len = binary.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      buffer[i] = binary.charCodeAt(i);
    }
    return new Blob([buffer], { type: mime });
  }


  /** Filtered packages matching the current date range and completed/delivered status
   *  Used by the File System view which expects Package[] input. */
  readonly filteredPackages = computed<Package[]>(() => {
    const pkgs = this.packageService.packages().filter(p => {
      const s = String(p.status ?? '').toLowerCase();
      return s === 'delivered' || s === PACKAGE_STATUS.DELIVERED || s === 'collected' || s.includes('deliver');
    });

    const start: number | undefined = this.startDate() ? new Date(this.startDate()).setHours(0,0,0,0) : undefined;
    const end: number | undefined = this.endDate() ? new Date(this.endDate()).setHours(0,0,0,0) : undefined;

    return pkgs.filter(pkg => {
      const iso = pkg.updated_at ?? pkg.created_at ?? '';
      const d = new Date(iso);
      const day = Number.isNaN(d.getTime()) ? NaN : d.setHours(0,0,0,0);
      if (Number.isNaN(day)) { return false; }
      return (start === undefined || day >= start) && (end === undefined || day <= end);
    });
  });

  clearFilters(): void {
    this.startDate.set('');
    this.endDate.set('');
  }

  /** Clear the current selection. Needed because `new` is not permitted in Angular templates. */
  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  // Handler for selection events emitted by the File System view component
  onSelectionChanged(ids: Set<string> | readonly string[] | any): void {
    // Normalize input (accept Set or Array)
    let idSet: Set<string>;
    if (ids instanceof Set) {
      idSet = new Set(ids as Set<string>);
    } else if (Array.isArray(ids)) {
      idSet = new Set(ids as string[]);
    } else {
      // Fallback: attempt to iterate
      try {
        idSet = new Set(Array.from(ids));
      } catch {
        idSet = new Set();
      }
    }

    console.debug('[CompletedOrders] onSelectionChanged ids=', Array.from(idSet));
    // Keep a copy to ensure external mutation doesn't affect our signal
    const previous = this.selectedIds();
    this.selectedIds.set(new Set(idSet));

    // For any newly selected package IDs, attempt to create a minimal POD
    // row immediately so subsequent download actions (or table-based
    // workflows) can see the POD. Run in background and log failures — we
    // don't block the UI.
    const added = Array.from(idSet).filter(i => !previous.has(i));
    if (added.length > 0) {
      console.debug('[CompletedOrders] creating POD rows for newly selected ids=', added);
      for (const id of added) {
        // Fire-and-forget; ensure errors are logged
        this.packageService.ensurePodExists(id).catch(err => {
          console.warn('[CompletedOrders] ensurePodExists failed for', id, err);
        });
      }
    }
  }
}
