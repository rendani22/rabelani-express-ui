/**
 * POD PDF generation utility.
 *
 * Builds a minimal Proof-of-Delivery HTML document from a package + the
 * receiver/witness payload captured by the mark-collected modal, then uses
 * `html2pdf.js` (already a project dependency) to render it as a base64 PDF.
 *
 * The base64 string is returned WITHOUT the `data:application/pdf;base64,`
 * prefix so it can be passed directly to the `update-package` Edge Function
 * as `pod.pdf_base64` for attachment to the "Package Completed" email.
 */

import type { MarkCollectedPayload } from '../models/package.models';
import type { Package } from '../models/package.models';

/** Render a self-contained HTML document representing the POD. */
function buildPodHtml(pkg: Package, payload: MarkCollectedPayload): string {
  const collectedAt = new Date(payload.collected_at).toLocaleString('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const itemsRows =
    pkg.items?.map(
      (item) => `
        <tr>
          <td style="padding:6px 8px;border:1px solid #ddd;width:60px;">${item.quantity}</td>
          <td style="padding:6px 8px;border:1px solid #ddd;">${escapeHtml(item.description)}</td>
        </tr>`,
    ).join('') ?? '';

  const partyBlock = (label: string, party: MarkCollectedPayload['receiver']) => `
    <div style="margin-top:18px;">
      <h3 style="margin:0 0 8px 0;font-size:14px;color:#242424;">${label}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;width:140px;font-weight:600;">Name</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(party.name)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;font-weight:600;">Employee #</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(party.employee_number)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;font-weight:600;">Phone</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(party.phone)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;font-weight:600;vertical-align:top;">Signature</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">
            <img src="${party.signature_data_url}" alt="Signature" style="max-height:90px;max-width:100%;display:block;" />
          </td>
        </tr>
      </table>
    </div>`;

  return `
    <div style="font-family:Helvetica,Arial,sans-serif;color:#242424;padding:24px;max-width:800px;">
      <div style="border-bottom:3px solid #f75757;padding-bottom:12px;margin-bottom:18px;">
        <h1 style="margin:0;font-size:22px;">Proof of Delivery</h1>
        <p style="margin:4px 0 0 0;font-size:12px;color:#666;">Rabelani MM Trading Enterprise</p>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;width:160px;font-weight:600;">Package Reference</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(pkg.reference)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;font-weight:600;">Receiver Email</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(pkg.receiver_email)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;font-weight:600;">Collected At</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(collectedAt)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;font-weight:600;">Status</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">Collected</td>
        </tr>
      </table>

      ${itemsRows
        ? `<h3 style="margin:14px 0 6px 0;font-size:14px;">Package Contents</h3>
           <table style="width:100%;border-collapse:collapse;font-size:12px;">
             <thead>
               <tr style="background:#fafafa;">
                 <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;width:60px;">Qty</th>
                 <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Description</th>
               </tr>
             </thead>
             <tbody>${itemsRows}</tbody>
           </table>`
        : ''}

      ${partyBlock('Receiver', payload.receiver)}
      ${partyBlock('Witness', payload.witness)}

      <p style="margin-top:24px;font-size:10px;color:#888;">
        This document was generated automatically when the package was marked as collected.
      </p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate a base64-encoded POD PDF for the supplied package and payload.
 *
 * Returns the raw base64 string (no `data:` prefix). Returns `null` if
 * generation fails — callers should treat absence as "no attachment" rather
 * than blocking the collection workflow.
 */
export async function generatePodPdfBase64(
  pkg: Package,
  payload: MarkCollectedPayload,
): Promise<string | null> {
  try {
    const html = buildPodHtml(pkg, payload);

    // Render into an off-screen container so html2canvas can rasterise it.
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.width = '800px';
    container.innerHTML = html;
    document.body.appendChild(container);

    try {
      // Dynamically import to keep the main bundle lean.
      const mod = await import('html2pdf.js');
      const html2pdf = (mod as { default?: unknown }).default ?? mod;

      const dataUri: string = await (
        html2pdf as (...args: unknown[]) => {
          set: (opts: unknown) => {
            from: (el: HTMLElement) => {
              outputPdf: (type: string) => Promise<string>;
            };
          };
        }
      )()
        .set({
          margin: [10, 10, 10, 10],
          filename: `POD-${pkg.reference}.pdf`,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(container.firstElementChild as HTMLElement)
        .outputPdf('datauristring');

      // Strip the `data:application/pdf;base64,` prefix.
      const idx = dataUri.indexOf('base64,');
      return idx >= 0 ? dataUri.slice(idx + 'base64,'.length) : dataUri;
    } finally {
      container.remove();
    }
  } catch (err) {
    console.error('[POD PDF] Failed to generate POD PDF:', err);
    return null;
  }
}

