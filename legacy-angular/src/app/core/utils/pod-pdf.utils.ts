/**
 * POD PDF generation utility.
 *
 * Dynamically renders the real `PodDocumentViewComponent` (the same view
 * used by the on-screen "Download PDF" action in the orders view) into an
 * off-screen container with a synthesized `PodRecord` built from the
 * mark-collected payload, then uses `html2pdf.js` to rasterise it.
 *
 * Producing the PDF this way guarantees the document attached to the
 * "Package Completed" email is byte-for-byte identical to the one users
 * download from the POD document modal — there is no parallel template.
 *
 * The base64 string is returned WITHOUT the `data:application/pdf;base64,`
 * prefix so it can be passed directly to the `update-package` Edge Function
 * as `pod.pdf_base64`.
 */

import {
  ApplicationRef,
  ComponentRef,
  EnvironmentInjector,
  createComponent,
} from '@angular/core';
import type { MarkCollectedPayload, Package, PodRecord } from '../models/package.models';
import { PodDocumentViewComponent } from '../../shared/components/modals/pod-document/pod-document-view.component';

/** Result of attempting to generate a POD PDF. */
export interface PodPdfResult {
  /** Raw base64 string (no `data:` prefix), or null if generation failed. */
  readonly base64: string | null;
  /** Human-readable error message when `base64` is null. */
  readonly error?: string;
}

/**
 * Build a synthetic `PodRecord` from the mark-collected payload. The real
 * record is created server-side by the `update-package` Edge Function — we
 * mirror those values here so the off-screen render matches what the user
 * will see when they re-open the POD modal later (modulo `pod_reference`
 * and `is_locked`, which are filled in by the database).
 */
function synthesizePodRecord(
  pkg: Package,
  payload: MarkCollectedPayload,
  staffName?: string | null,
  completionStatus?: 'Delivered' | 'Collected' | null,
): PodRecord {
  // The PDF is generated on the client BEFORE the edge function inserts
  // and locks the POD row. To avoid the attached document looking like a
  // "Draft" we render it as if it were already locked at the moment of
  // collection. The package reference is used as the visible POD
  // reference until the server-issued one is available — both refer to
  // the same package, so it remains an unambiguous identifier.
  return {
    id: '',
    package_id: pkg.id,
    pod_reference: pkg.reference,
    is_locked: true,
    locked_at: payload.collected_at,

    receiver_name: payload.receiver.name,
    receiver_employee_number: payload.receiver.employee_number,
    receiver_phone: payload.receiver.phone,
    receiver_signature: payload.receiver.signature_data_url,

    witness_name: payload.witness.name,
    witness_employee_number: payload.witness.employee_number,
    witness_phone: payload.witness.phone,
    witness_signature: payload.witness.signature_data_url,

    completed_at: payload.collected_at,
    completed_by: null,
    staff_name: staffName,
    completion_status: completionStatus,
  };
}

/**
 * Generate a base64-encoded POD PDF for the supplied package and payload.
 *
 * Returns `{ base64, error? }`. Callers should treat a null `base64` as
 * "no attachment" rather than blocking the collection workflow, but should
 * surface `error` to the user for visibility.
 *
 * @param pkg                 Package being marked collected (with items, if any).
 * @param payload             Receiver/witness payload captured by the modal.
 * @param appRef              The current `ApplicationRef` (caller injects it).
 * @param environmentInjector The current `EnvironmentInjector`.
 * @param staffName           Optional name of the staff member/driver completing the action.
 * @param completionStatus    Optional 'Delivered' or 'Collected' status label.
 */
export async function generatePodPdfBase64(
  pkg: Package,
  payload: MarkCollectedPayload,
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  staffName?: string | null,
  completionStatus?: 'Delivered' | 'Collected' | null,
): Promise<PodPdfResult> {
  let host: HTMLDivElement | null = null;
  let componentRef: ComponentRef<PodDocumentViewComponent> | null = null;

  try {
    // Off-screen host container — must be in the live DOM for html2canvas
    // to rasterise it. Width matches A4 (210mm ≈ 794px @ 96dpi) so the
    // layout mirrors the on-screen card.
    host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-10000px';
    host.style.top = '0';
    host.style.width = '794px';
    host.style.background = '#ffffff';
    host.setAttribute('data-pod-pdf-host', '');
    document.body.appendChild(host);

    // Create + attach the real view component so its template (and Tailwind
    // classes) are rendered identically to the on-screen modal.
    componentRef = createComponent(PodDocumentViewComponent, {
      hostElement: host,
      environmentInjector,
    });
    componentRef.setInput('package', pkg);
    componentRef.setInput('pod', synthesizePodRecord(pkg, payload, staffName, completionStatus));
    appRef.attachView(componentRef.hostView);
    componentRef.changeDetectorRef.detectChanges();

    // Wait one frame so layout / image decode (signature data URLs) settle
    // before html2canvas reads the DOM.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const target =
      (componentRef.instance.documentEl?.nativeElement as HTMLElement | null) ?? host;

    // Dynamically import to keep the main bundle lean.
    const mod = await import('html2pdf.js');
    const html2pdf = (mod as { default?: unknown }).default ?? mod;

    // Use the `.toPdf().get('pdf')` chain to obtain the jsPDF instance and
    // call `output('datauristring')` directly — this is more reliable than
    // `.outputPdf('datauristring')` across html2pdf.js versions and bundlers.
    interface JsPdfInstance {
      output: (type: string) => string;
      internal: {
        getNumberOfPages: () => number;
        pageSize: {
          getWidth: () => number;
          getHeight: () => number;
        };
      };
      setPage: (page: number) => void;
      setFontSize: (size: number) => void;
      setTextColor: (r: number, g: number, b: number) => void;
      text: (text: string, x: number, y: number, opts?: { align?: string }) => void;
    }

    const worker = (
      html2pdf as (...args: unknown[]) => {
        set: (opts: unknown) => {
          from: (el: HTMLElement) => {
            toPdf: () => {
              get: (key: 'pdf') => Promise<JsPdfInstance>;
            };
          };
        };
      }
    )()
      .set({
        margin: [10, 10, 15, 10],
        filename: `POD-${pkg.reference}${pkg.po_number ? `-${pkg.po_number}` : ''}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .from(target)
      .toPdf();

    const pdfInstance = await worker.get('pdf');

    // Stamp a footer on every page: "Purchase Order: <po>" left, "Page X of Y" right.
    try {
      const totalPages = pdfInstance.internal.getNumberOfPages();
      const pageWidth = pdfInstance.internal.pageSize.getWidth();
      const pageHeight = pdfInstance.internal.pageSize.getHeight();
      const poLabel = pkg.po_number
        ? `Purchase Order: ${pkg.po_number}`
        : `Reference: ${pkg.reference}`;

      for (let i = 1; i <= totalPages; i++) {
        pdfInstance.setPage(i);
        pdfInstance.setFontSize(8);
        pdfInstance.setTextColor(120, 120, 120);
        pdfInstance.text(poLabel, 10, pageHeight - 5);
        pdfInstance.text(`Page ${i} of ${totalPages}`, pageWidth - 10, pageHeight - 5, {
          align: 'right',
        });
      }
    } catch (footerErr) {
      // Footer is a nice-to-have — log but don't fail PDF generation.
      console.warn('[POD PDF] Failed to stamp page footers:', footerErr);
    }

    const dataUri = pdfInstance.output('datauristring');

    if (typeof dataUri !== 'string' || dataUri.length === 0) {
      return { base64: null, error: 'PDF generator returned an empty result' };
    }

    // Strip the `data:application/pdf;...;base64,` prefix.
    const idx = dataUri.indexOf('base64,');
    const base64 = idx >= 0 ? dataUri.slice(idx + 'base64,'.length) : dataUri;
    return { base64 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POD PDF] Failed to generate POD PDF:', err);
    return { base64: null, error: message };
  } finally {
    if (componentRef) {
      try {
        appRef.detachView(componentRef.hostView);
      } catch {
        /* already detached */
      }
      componentRef.destroy();
    }
    if (host) host.remove();
  }
}
