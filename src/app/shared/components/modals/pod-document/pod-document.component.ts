import {
  Component,
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
import { PodDocumentViewComponent } from './pod-document-view.component';

/**
 * Printable Proof-of-Delivery document modal.
 *
 * Wraps the stateless `PodDocumentViewComponent` with modal chrome,
 * loading / error states, and a "Download PDF" action. The same view
 * component is used by `generatePodPdfBase64` so the PDF emailed to the
 * receiver after a package is collected matches the document users can
 * download from this modal byte-for-byte.
 *
 * Only meaningful for packages whose status is `delivered` or `collected`.
 */
@Component({
  selector: 'app-pod-document',
  standalone: true,
  imports: [CommonModule, PodDocumentViewComponent],
  templateUrl: './pod-document.component.html',
  styleUrls: ['./pod-document.component.css'],
})
export class PodDocumentComponent implements OnChanges {
  private readonly packageService = inject(PackageService);

  @Input() isOpen = false;
  @Input() package: Package | null = null;

  @Output() closeModal = new EventEmitter<void>();

  @ViewChild('viewRef') viewRef?: PodDocumentViewComponent;

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
    const element = this.viewRef?.documentEl?.nativeElement;
    const pkg = this.package;
    const podRecord = this.pod();
    if (!element || !pkg || !podRecord) return;

    this.generating.set(true);
    try {
      // Dynamically import to keep the main bundle lean.
      const mod = await import('html2pdf.js');
      const html2pdf = (mod as { default?: unknown }).default ?? mod;

      // Filename always uses package reference to ensure consistency:
      // POD-<package_reference>[-<po_number>].pdf
      const poSuffix = pkg.po_number ? `-${pkg.po_number}` : '';
      const filename = `POD-${pkg.reference}${poSuffix}.pdf`;

      await (html2pdf as (...args: unknown[]) => {
        set: (opts: unknown) => {
          from: (el: HTMLElement) => {
            toPdf: () => {
              get: (key: 'pdf') => Promise<{
                internal: {
                  getNumberOfPages: () => number;
                  pageSize: { getWidth: () => number; getHeight: () => number };
                };
                setPage: (page: number) => void;
                setFontSize: (size: number) => void;
                setTextColor: (r: number, g: number, b: number) => void;
                text: (text: string, x: number, y: number, opts?: { align?: string }) => void;
                save: (filename?: string) => Promise<void>;
              }>;
            };
          };
        };
      })()
        .set({
          margin: [10, 10, 15, 10],
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(element)
        .toPdf()
        .get('pdf')
        .then(async (pdf) => {
          // Stamp footer on every page: PO/Reference (left) + Page X of Y (right).
          try {
            const totalPages = pdf.internal.getNumberOfPages();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const poLabel = pkg.po_number
              ? `Purchase Order: ${pkg.po_number}`
              : `Reference: ${pkg.reference}`;
            for (let i = 1; i <= totalPages; i++) {
              pdf.setPage(i);
              pdf.setFontSize(8);
              pdf.setTextColor(120, 120, 120);
              pdf.text(poLabel, 10, pageHeight - 5);
              pdf.text(`Page ${i} of ${totalPages}`, pageWidth - 10, pageHeight - 5, {
                align: 'right',
              });
            }
          } catch (footerErr) {
            console.warn('[POD PDF] Failed to stamp page footers:', footerErr);
          }
          await pdf.save(filename);
        });
    } catch (err) {
      console.error('Failed to generate PDF', err);
      this.errorMessage.set('Failed to generate PDF. Please try again.');
    } finally {
      this.generating.set(false);
    }
  }
}
