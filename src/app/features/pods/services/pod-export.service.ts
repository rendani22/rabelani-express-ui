import { Injectable, inject, signal, type WritableSignal } from '@angular/core';
import { PackageService } from '../../../core/services/package.service';
import { FileSaveService } from '../../../shared/services/file-save.service';
import { createZip, ZipEntry } from '../../../core/utils/zip.utils';
import { generatePodPdfBase64 } from '../../../core/utils/pod-pdf.utils';
import { ApplicationRef, EnvironmentInjector } from '@angular/core';
import {MarkCollectedPayload, StaffService} from '../../../core';

/**
 * Service responsible for creating bulk POD exports.
 *
 * This service performs client-side export creation by fetching existing
 * POD PDF URLs when available or synthesising PDFs via the existing
 * POD PDF generator. To keep the UI responsive the export is performed
 * asynchronously and exposes a progress signal.
 */
@Injectable({ providedIn: 'root' })
export class PodExportService {
  private readonly packageService = inject(PackageService);
  private readonly staffService = inject(StaffService);
  private readonly appRef = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);
  // In-memory job registry for export jobs so UI can poll by job id.
  private readonly jobs = new Map<string, {
    progress: WritableSignal<number>;
    status: WritableSignal<'pending' | 'preparing' | 'in-progress' | 'complete' | 'failed'>;
    promise: Promise<{ success: boolean; url?: string; blob?: Blob; error?: string }>;
    result?: { success: boolean; url?: string; blob?: Blob; error?: string };
  }>();

  /**
   * Create a zip export for the provided package IDs.
   * Returns an object containing a progress signal and a promise that
   * resolves with the export Blob URL when completed.
   */
  createExport(packageIds: readonly string[]) {
    const progress = signal<number>(0);
    const status = signal<'pending' | 'preparing' | 'in-progress' | 'complete' | 'failed'>('pending');

    const promise = (async (): Promise<{ success: boolean; url?: string; blob?: Blob; error?: string }> => {
      if (!packageIds || packageIds.length === 0) {
        status.set('failed');
        return { success: false, error: 'No package IDs provided' };
      }

      try {
        status.set('preparing');

        const entries: ZipEntry[] = [];

        // Limit concurrent PDF generation/fetches to avoid blocking the browser
        const concurrency = 3;
        let completed = 0;

        async function processOne(id: string, self: PodExportService) {
          // Try to get existing POD record and PDF URL
          const pod = await self.packageService.getPodForPackage(id);
            if (pod && (pod as any).pdf_url) {
                try {
                  const res = await fetch((pod as any).pdf_url);
              const blob = await res.blob();
              const name = `POD-${id}.pdf`;
              entries.push({ name, data: blob });
            } catch (err) {
              // Fall back to generating PDF if fetch fails
              const gen = await self.generatePdfForPackage(id);
              if (gen) entries.push({ name: `POD-${id}.pdf`, data: gen });
            }
          } else {
            const gen = await self.generatePdfForPackage(id);
            if (gen) entries.push({ name: `POD-${id}.pdf`, data: gen });
          }
          completed += 1;
          progress.set(Math.round((completed / packageIds.length) * 100));
        }

        // Simple pool runner
        const runners: Promise<void>[] = [];
        let idx = 0;
        const self = this;
        while (idx < packageIds.length) {
          while (runners.length < concurrency && idx < packageIds.length) {
            const id = packageIds[idx++];
            const p = processOne(id, self).then(() => {
              // remove from runners when done
              const i = runners.indexOf(p as unknown as Promise<void>);
              if (i >= 0) runners.splice(i, 1);
            });
            runners.push(p);
          }
          // wait for at least one to finish
          await Promise.race(runners);
        }

        // Wait for remaining
        await Promise.all(runners);

        status.set('in-progress');

        // Create zip blob
        const zipBlob = await createZip(entries);

        // Create object URL
        const url = URL.createObjectURL(zipBlob);

        status.set('complete');
        progress.set(100);

        return { success: true, url, blob: zipBlob };
      } catch (err) {
        console.error('[PodExportService] export failed', err);
        status.set('failed');
        return { success: false, error: (err instanceof Error ? err.message : String(err)) };
      }
    })();

    return { progress: progress.asReadonly(), status: status.asReadonly(), promise };
  }

  /**
   * Create an export job and return a job id. The UI may call `getJob(jobId)`
   * to obtain signals for progress/status and await the promise for completion.
   */
  createExportJob(packageIds: readonly string[], options?: { merge?: boolean }) {
    const jobId = this.generateId();
    const progress = signal<number>(0);
    const status = signal<'pending' | 'preparing' | 'in-progress' | 'complete' | 'failed'>('pending');

    const promise = (async () => {
      try {
        status.set('preparing');
        // Delegate to internal exporter. If merge is true, produce a single PDF blob;
        // otherwise produce a ZIP as before.
        const result = await this.createExportInternal(packageIds, !!options?.merge, progress, status);
        this.jobs.get(jobId)!.result = result;
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        status.set('failed');
        progress.set(0);
        const res = { success: false, error: message };
        this.jobs.get(jobId)!.result = res;
        return res;
      }
    })();

    this.jobs.set(jobId, { progress, status, promise });
    return jobId;
  }

  /** Return job signals/promise for polling/UI consumption */
  getJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return {
      progress: job.progress.asReadonly(),
      status: job.status.asReadonly(),
      promise: job.promise,
    };
  }

  private generateId() {
    try {
      // modern browsers
      // @ts-ignore
      return (crypto && crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2, 10);
    } catch {
      return Math.random().toString(36).slice(2, 10);
    }
  }

  /** Internal export that supports optional merging into a single PDF. */
  private async createExportInternal(
    packageIds: readonly string[],
    mergeSinglePdf: boolean,
    progressSignal: WritableSignal<number>,
    statusSignal: WritableSignal<'pending' | 'preparing' | 'in-progress' | 'complete' | 'failed'>,
  ): Promise<{ success: boolean; url?: string; blob?: Blob; error?: string }> {
    if (!packageIds || packageIds.length === 0) {
      statusSignal.set('failed');
      return { success: false, error: 'No package IDs provided' };
    }

    statusSignal.set('preparing');
    const entries: ZipEntry[] = [];

    const concurrency = 3;
    let completed = 0;

    const self = this;
    async function processOne(id: string) {
      const pod = await self.packageService.getPodForPackage(id);
      if (pod && (pod as any).pdf_url) {
        try {
          const res = await fetch((pod as any).pdf_url);
          const blob = await res.blob();
          return { id, blob };
        } catch (err) {
          // fallthrough to generating
        }
      }

      const gen = await self.generatePdfForPackage(id);
      return { id, blob: gen };
    }

    const results: { id: string; blob: Blob | null }[] = [];
    const runners: Promise<void>[] = [];
    let idx = 0;
    while (idx < packageIds.length) {
      while (runners.length < concurrency && idx < packageIds.length) {
        const id = packageIds[idx++];
        const p = processOne(id).then((res) => {
          results.push({ id: res.id, blob: res.blob });
          completed += 1;
          progressSignal.set(Math.round((completed / packageIds.length) * 100));
        });
        runners.push(p);
      }
      await Promise.race(runners);
      // cleanup finished
      for (let i = runners.length - 1; i >= 0; i--) {
        const r = runners[i];
        if (r && (r as any).done) runners.splice(i, 1);
      }
    }
    await Promise.all(runners);

    statusSignal.set('in-progress');

    // If merge requested, merge all PDFs into one
    if (mergeSinglePdf) {
      try {
        const pdfEntries = results.filter(r => r.blob).map(r => ({ name: `POD-${r.id}.pdf`, data: r.blob as Blob }));
        const merged = await this.mergePdfs(pdfEntries);
        progressSignal.set(100);
        statusSignal.set('complete');
        return { success: true, blob: merged };
      } catch (err) {
        console.error('[PodExportService] merge failed', err);
        statusSignal.set('failed');
        return { success: false, error: (err instanceof Error ? err.message : String(err)) };
      }
    }

    // Create zip
    try {
      const zipBlob = await createZip(results.filter(r => r.blob).map(r => ({ name: `POD-${r.id}.pdf`, data: r.blob as Blob })));
      const url = URL.createObjectURL(zipBlob);
      progressSignal.set(100);
      statusSignal.set('complete');
      return { success: true, url, blob: zipBlob };
    } catch (err) {
      console.error('[PodExportService] zip creation failed', err);
      statusSignal.set('failed');
      return { success: false, error: (err instanceof Error ? err.message : String(err)) };
    }
  }

  private async mergePdfs(entries: { name: string; data: Blob }[]): Promise<Blob> {
    // dynamic import to keep bundle size small
    const mod = await import('pdf-lib');
    const PDFLib = (mod as any);
    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();

    for (const e of entries) {
      if (!e.data) continue;
      const arr = new Uint8Array(await e.data.arrayBuffer());
      const src = await PDFDocument.load(arr);
      const copied = await mergedPdf.copyPages(src, src.getPageIndices());
      copied.forEach((p: any) => mergedPdf.addPage(p));
    }

    const mergedBytes = await mergedPdf.save();
    return new Blob([mergedBytes], { type: 'application/pdf' });
  }

  private async generatePdfForPackage(packageId: string): Promise<Blob | null> {
    try {
      const pkgRes = await this.packageService.getPackage(packageId);
      if (!pkgRes.success || !pkgRes.data) return null;
      const pkg = pkgRes.data;

      // Extract existing POD details if available to ensure the generated PDF
      // matches the previously captured identification and signatures.
      const pod = await this.packageService.getPodForPackage(packageId);

      // Create a mark-collected payload so the PDF renderer has required fields.
      // Reconstitute from the POD record if it exists, otherwise use minimal placeholders.
      const payload: MarkCollectedPayload = {
        collected_at: pod?.completed_at || pkg.updated_at || new Date().toISOString(),
        receiver: {
          name: pod?.receiver_name || '',
          employee_number: pod?.receiver_employee_number || '',
          phone: pod?.receiver_phone || '',
          signature_data_url: pod?.receiver_signature || '',
        },
        witness: {
          name: pod?.witness_name || '',
          employee_number: pod?.witness_employee_number || '',
          phone: pod?.witness_phone || '',
          signature_data_url: pod?.witness_signature || '',
        },
      };

      const currentStaff = this.staffService.currentProfile() ?? await this.staffService.loadCurrentProfile();
      // A "delivery photo" in the notes is only ever attached by a driver
      // completing a delivery, so its presence forces 'Delivered'. Otherwise
      // honour any persisted status, then fall back to the staff role.
      const completionStatus: 'Delivered' | 'Collected' = /Delivery photo:/i.test(pkg.notes ?? '')
        ? 'Delivered'
        : pod?.completion_status ?? (currentStaff?.role === 'driver' ? 'Delivered' : 'Collected');
      console.log(pkg.notes);
      const result = await generatePodPdfBase64(
        pkg as any,
        payload,
        this.appRef,
        this.envInjector,
        pod?.staff_name,
        completionStatus
      );
      if (!result.base64) return null;

      const binary = atob(result.base64);
      const len = binary.length;
      const buf = new Uint8Array(len);
      for (let i = 0; i < len; i++) buf[i] = binary.charCodeAt(i);
      const blob = new Blob([buf], { type: 'application/pdf' });
      return blob;
    } catch (err) {
      console.error('[PodExportService] generatePdfForPackage error', err);
      return null;
    }
  }
}
