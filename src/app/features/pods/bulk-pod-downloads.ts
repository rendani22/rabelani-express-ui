import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, Signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { PACKAGE_STATUS } from '../../core';
import { PackageService } from '../../core/services/package.service';
import { PodExportService } from './services/pod-export.service';
import { FileSaveService } from '../../shared/services/file-save.service';
import { ToastService } from '../../shared/components/toast/toast.service';

@Component({
  selector: 'app-bulk-pod-downloads',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './bulk-pod-downloads.html',
  styleUrls: ['./bulk-pod-downloads.css'],
})
export class BulkPodDownloadsComponent {
  private readonly fb = inject(FormBuilder);
  public readonly packageService = inject(PackageService);
  private readonly podExport = inject(PodExportService);
  private readonly fileSave = inject(FileSaveService);
  public readonly toast = inject(ToastService);

  readonly filtersForm = this.fb.nonNullable.group({
    dateFrom: [''],
    dateTo: [''],
    quick: [''],
    drivers: [''],
    routes: [''],
    customer: [''],
    deliveryStatus: [''],
    podStatus: [''],
  });

  readonly packages = this.packageService.packages;
  readonly isLoading = this.packageService.isLoading;

  // Expose computed counts for template use (avoids arrow functions in template)
  totalDeliveries() {
    return (this.packages() ?? []).length;
  }

  podsUploadedCount() {
    return (this.packages() ?? []).filter(p => p.status === PACKAGE_STATUS.COLLECTED).length;
  }

  missingPodsCount() {
    return (this.packages() ?? []).filter(p => p.status !== PACKAGE_STATUS.COLLECTED).length;
  }

  activeDriversCount() {
    const ids = (this.packages() ?? []).map(p => p.picked_up_by).filter((v): v is string => !!v);
    return Array.from(new Set(ids)).length;
  }

  // Selection state
  private selectedSet = new Set<string>();
  readonly selectedCount = signal(0);

  // Export state
  exportProgress: Signal<number> | null = null;
  exportInProgress = signal(false);
  private currentJobId: string | null = null;
  private pollTimer: number | null = null;

  // Pagination
  pageSize = 100;
  currentPage = signal(0);

  constructor() {
    // Initial load
    void this.packageService.loadPackages({ limit: 500 });
  }

  trackByPackage(index: number, pkg: any) {
    return pkg.id;
  }

  /** Handler for the header "select all" checkbox */
  onSelectAll(event: Event) {
    const checked = (event.target as HTMLInputElement)?.checked ?? false;
    if (checked) {
      this.packagesSlice().forEach(p => this.toggleSelect(p.id, true));
    } else {
      this.clearSelection();
    }
  }

  /** Handler for row checkbox change (safer event typing) */
  onRowCheckboxChange(event: Event, pkgId: string) {
    const checked = (event.target as HTMLInputElement)?.checked ?? false;
    this.toggleSelect(pkgId, checked);
  }

  toggleSelect(pkgId: string, checked?: boolean) {
    if (checked === undefined) {
      if (this.selectedSet.has(pkgId)) this.selectedSet.delete(pkgId);
      else this.selectedSet.add(pkgId);
    } else {
      if (checked) this.selectedSet.add(pkgId);
      else this.selectedSet.delete(pkgId);
    }
    this.selectedCount.set(this.selectedSet.size);
  }

  isSelected(pkgId: string) {
    return this.selectedSet.has(pkgId);
  }

  clearSelection() {
    this.selectedSet.clear();
    this.selectedCount.set(0);
  }

  async downloadSelected() {
    // Start an export job that produces a ZIP (backwards-compatible)
    await this.startExportJob(false);
  }

  async downloadSelectedAsZip() {
    await this.startExportJob(false);
  }

  async mergeSelected() {
    await this.startExportJob(true);
  }

  private async startExportJob(merge: boolean) {
    if (this.selectedSet.size === 0) {
      this.toast.info('No PODs selected');
      return;
    }

    const ids = Array.from(this.selectedSet);
    const jobId = this.podExport.createExportJob(ids, { merge });
    this.currentJobId = jobId;
    const job = this.podExport.getJob(jobId);
    if (!job) {
      this.toast.error('Failed to start export job');
      return;
    }

    this.exportProgress = job.progress;
    this.exportInProgress.set(true);

    // Poll status every second (reads signals from the job)
    this.pollTimer = window.setInterval(() => {
      try {
        const s = (job.status as any)();
        const p = (job.progress as any)();
        // We could surface ephemeral UI updates here if needed
      } catch {
        // ignore
      }
    }, 1000);

    try {
      const result = await job.promise;
      if (!result.success) {
        this.toast.error(result.error ?? 'Export failed');
        return;
      }

      if (result.blob) {
        const suggested = merge ? 'pods-merged.pdf' : 'pods.zip';
        await this.fileSave.saveBlob(result.blob, { suggestedName: suggested });
        this.toast.success(merge ? 'Merged PDF downloaded' : 'Export downloaded');
      } else if (result.url) {
        const a = document.createElement('a');
        a.href = result.url;
        a.download = 'pods.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        this.toast.success('Export ready');
      }
    } catch (err) {
      this.toast.error('Export failed');
    } finally {
      this.exportInProgress.set(false);
      this.exportProgress = null;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.currentJobId = null;
    }
  }

  // Small helpers for quick filters
  async applyQuickRange(kind: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek') {
    const now = new Date();
    let from: Date, to: Date;
    switch (kind) {
      case 'today':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        to = new Date(from);
        to.setDate(to.getDate() + 1);
        break;
      case 'yesterday':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        to = new Date(from);
        to.setDate(to.getDate() + 1);
        break;
      case 'thisWeek':
        const day = now.getDay();
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
        to = new Date(from);
        to.setDate(to.getDate() + 7);
        break;
      case 'lastWeek':
        const d = now.getDay();
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d - 7);
        to = new Date(from);
        to.setDate(to.getDate() + 7);
        break;
    }
    this.filtersForm.setValue({ dateFrom: from.toISOString(), dateTo: to.toISOString(), quick: kind, drivers: '', routes: '', customer: '', deliveryStatus: '', podStatus: '' });
    await this.applyFilters();
  }

  async applyFilters() {
    const v = this.filtersForm.value;
    const filters: any = {};
    if (v.dateFrom) filters.dateFrom = v.dateFrom;
    if (v.dateTo) filters.dateTo = v.dateTo;
    // other filters (driver/route/customer/status) would be applied to server queries
    await this.packageService.loadPackages({ dateFrom: filters.dateFrom, dateTo: filters.dateTo, limit: 1000 });
    this.clearSelection();
  }

  packagesSlice() {
    const all = this.packages() ?? [];
    const start = this.currentPage() * this.pageSize;
    return all.slice(0, start + this.pageSize);
  }

  loadMore() {
    this.currentPage.update(v => v + 1);
  }
}





