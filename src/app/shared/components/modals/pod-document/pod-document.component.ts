import {
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Package, PackageService, PodRecord, PACKAGE_STATUS } from '../../../../core';

/**
 * Printable Proof-of-Delivery document.
 *
 * Renders a full A4-style document containing:
 * - Order / package details (reference, dates, status, items)
 * - Receiver block (name, employee #, phone, signature)
 * - Witness block (name, employee #, phone, signature)
 * - POD reference + lock status + completion timestamp
 *
 * Only meaningful for packages whose status is `delivered` or `collected`.
 * The on-screen view shows a modal overlay; the print view (triggered via
 * `Print` button) hides the chrome and prints just the document card.
 */
@Component({
  selector: 'app-pod-document',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pod-document.component.html',
  styleUrls: ['./pod-document.component.css'],
})
export class PodDocumentComponent implements OnChanges {
  private readonly packageService = inject(PackageService);

  @Input() isOpen = false;
  @Input() package: Package | null = null;

  @Output() closeModal = new EventEmitter<void>();

  @ViewChild('documentEl') documentEl?: ElementRef<HTMLElement>;

  readonly pod = signal<PodRecord | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly generating = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['isOpen'] || changes['package']) && this.isOpen && this.package) {
      void this.loadPod();
    } else if (changes['isOpen'] && !this.isOpen) {
      // Reset on close to avoid stale rendering on re-open.
      this.pod.set(null);
      this.errorMessage.set(null);
    }
  }

  private async loadPod(): Promise<void> {
    const pkg = this.package;
    if (!pkg) return;

    if (
      pkg.status !== PACKAGE_STATUS.DELIVERED &&
      pkg.status !== PACKAGE_STATUS.COLLECTED
    ) {
      this.pod.set(null);
      this.errorMessage.set(
        'Proof of delivery is only available for delivered or collected packages.'
      );
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const record = await this.packageService.getPodForPackage(pkg.id);
      this.pod.set(record);
      if (!record) {
        this.errorMessage.set('No proof-of-delivery record found for this package.');
      }
    } catch {
      this.errorMessage.set('Failed to load proof-of-delivery details.');
    } finally {
      this.loading.set(false);
    }
  }

  onClose(): void {
    this.closeModal.emit();
  }

  onPrint(): void {
    void this.downloadPdf();
  }

  private async downloadPdf(): Promise<void> {
    const element = this.documentEl?.nativeElement;
    const pkg = this.package;
    const podRecord = this.pod();
    if (!element || !pkg || !podRecord) return;

    this.generating.set(true);
    try {
      // Dynamically import to keep the main bundle lean.
      const mod = await import('html2pdf.js');
      const html2pdf = (mod as { default?: unknown }).default ?? mod;

      const filename = `POD-${podRecord.pod_reference || pkg.reference}.pdf`;

      await (html2pdf as (...args: unknown[]) => {
        set: (opts: unknown) => { from: (el: HTMLElement) => { save: () => Promise<void> } };
      })()
        .set({
          margin: [10, 10, 10, 10],
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(element)
        .save();
    } catch (err) {
      console.error('Failed to generate PDF', err);
      this.errorMessage.set('Failed to generate PDF. Please try again.');
    } finally {
      this.generating.set(false);
    }
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatDateTime(dateString: string | null | undefined): string {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  getStatusLabel(status: string | undefined | null): string {
    if (!status) return '—';
    const labels: Record<string, string> = {
      [PACKAGE_STATUS.PENDING]: 'Pending',
      [PACKAGE_STATUS.NOTIFIED]: 'Notified',
      [PACKAGE_STATUS.IN_TRANSIT]: 'In Transit',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Ready for Collection',
      [PACKAGE_STATUS.DELIVERED]: 'Delivered',
      [PACKAGE_STATUS.COLLECTED]: 'Collected',
    };
    return labels[status] ?? status;
  }

  totalQuantity(): number {
    const items = this.package?.items;
    if (!items) return 0;
    return items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  }
}

