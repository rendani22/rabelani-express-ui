import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Package, PodRecord, PACKAGE_STATUS } from '../../../../core';

/**
 * Stateless, printable Proof-of-Delivery document view.
 *
 * Renders ONLY the `<article class="pod-document">` markup so it can be
 * reused both inside the on-screen modal (`PodDocumentComponent`) and by
 * the off-screen PDF generator (`generatePodPdfBase64`). This keeps the
 * downloadable PDF identical to the document attached to the
 * "Package Completed" email.
 */
@Component({
  selector: 'app-pod-document-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pod-document-view.component.html',
  styleUrls: ['./pod-document-view.component.css'],
})
export class PodDocumentViewComponent {
  @Input({ required: true }) package!: Package;
  @Input({ required: true }) pod!: PodRecord;

  @ViewChild('documentEl', { static: true })
  documentEl!: ElementRef<HTMLElement>;

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
      [PACKAGE_STATUS.RETURNED]: 'Canceled',
    };
    return labels[status] ?? status;
  }

  totalQuantity(): number {
    const items = this.package?.items;
    if (!items) return 0;
    return items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  }

  /**
   * Returns the display string for Purchase Order and Reference in the POD.
   * Preferred format: "Purchase Order <po_number> · Reference <reference>".
   * Falls back sensibly to whichever values are present or to the pod reference.
   */
  getPoReferenceDisplay(): string {
    const po = this.package?.po_number;
    const ref = this.package?.reference;
    if (po && ref) return `${po} · ${ref}`;
    if (po) return `Purchase Order ${po}`;
    if (ref) return `Reference ${ref}`;
    return this.pod?.pod_reference ?? '—';
  }

  /**
   * Extracts driver-uploaded "Delivery photo" URLs from the notes field so
   * they can be rendered inline as image previews on the POD document.
   */
  parseNotes(notes: string | null | undefined): { photoUrls: string[]; text: string } {
    if (!notes) return { photoUrls: [], text: '' };
    const photoUrls: string[] = [];
    const photoPattern = /delivery photo:\s*(https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif|heic)(?:\?\S*)?)/gi;
    let cleaned = notes.replace(photoPattern, (_m, url: string) => {
      photoUrls.push(url);
      return '';
    });
    if (photoUrls.length === 0) {
      const bareImagePattern = /(https?:\/\/\S*delivery-photos\/\S+|https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif|heic)(?:\?\S*)?)/gi;
      cleaned = cleaned.replace(bareImagePattern, (url: string) => {
        photoUrls.push(url);
        return '';
      });
    }
    const text = cleaned.replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').trim();
    return { photoUrls, text };
  }
}

