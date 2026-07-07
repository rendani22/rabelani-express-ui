import { Injectable } from '@angular/core';

export interface SaveOptions {
  suggestedName?: string;
  preferFileSystem?: boolean; // try File System Access API when available
}

@Injectable({ providedIn: 'root' })
export class FileSaveService {
  /**
   * Save a single Blob to disk. If the browser supports the File System Access API and
   * preferFileSystem is true, the method will prompt the user with a native save dialog.
   * Otherwise it falls back to a classic anchor-based download.
   */
  async saveBlob(blob: Blob, options: SaveOptions = {}): Promise<void> {
    const name = options.suggestedName ?? 'download.bin';

    // If user prefers file system and the API is available, use it
    // @ts-ignore - window.showSaveFilePicker may not be present on all TS libs
    if (options.preferFileSystem && 'showSaveFilePicker' in window) {
      try {
        // @ts-ignore
        const handle = await window.showSaveFilePicker({ suggestedName: name });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        // if user cancels or an error occurs, fallback to download
        // Continue to fallback below
        // eslint-disable-next-line no-console
        console.warn('File System save failed, falling back to download:', err);
      }
    }

    // Fallback: create an object URL and click an anchor
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Save multiple files. If File System Access API directory picker is available and
   * preferFileSystem is true, write individual files to the selected directory. Otherwise
   * create a ZIP and trigger a single download.
   */
  async saveFiles(files: { name: string; data: Blob | string | ArrayBuffer }[], options: SaveOptions = {}): Promise<void> {
    // If FS API available and requested, write files directly
    // @ts-ignore
    if (options.preferFileSystem && 'showDirectoryPicker' in window) {
      try {
        // @ts-ignore
        const dirHandle = await window.showDirectoryPicker();
        for (const f of files) {
          const fileHandle = await dirHandle.getFileHandle(f.name, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(f.data as Blob);
          await writable.close();
        }
        return;
      } catch (err) {
        // fallback to zip
        // eslint-disable-next-line no-console
        console.warn('Directory save failed, falling back to ZIP download:', err);
      }
    }

    // Fallback: create ZIP using dynamic import of the zip util (keeps bundle small)
    const { createZip } = await import('../../core/utils/zip.utils');
    const entries = files.map((f) => ({ name: f.name, data: f.data }));
    const zipBlob = await createZip(entries);
    const defaultName = options.suggestedName ?? 'files.zip';
    await this.saveBlob(zipBlob, { suggestedName: defaultName, preferFileSystem: false });
  }
}

