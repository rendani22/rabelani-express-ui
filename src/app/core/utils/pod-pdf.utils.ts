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
function synthesizePodRecord(pkg: Package, payload: MarkCollectedPayload): PodRecord {
  return {
    id: '',
    package_id: pkg.id,
    pod_reference: null,
    is_locked: false,
    locked_at: null,

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
 */
export async function generatePodPdfBase64(
  pkg: Package,
  payload: MarkCollectedPayload,
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
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
    componentRef.setInput('pod', synthesizePodRecord(pkg, payload));
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
    const worker = (
      html2pdf as (...args: unknown[]) => {
        set: (opts: unknown) => {
          from: (el: HTMLElement) => {
            toPdf: () => {
              get: (key: 'pdf') => Promise<{ output: (type: string) => string }>;
            };
          };
        };
      }
    )()
      .set({
        margin: [10, 10, 10, 10],
        filename: `POD-${pkg.reference}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .from(target)
      .toPdf();

    const pdfInstance = await worker.get('pdf');
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

