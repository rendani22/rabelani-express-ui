export interface ZipEntry {
  name: string; // file name inside the zip
  data: Blob | string | ArrayBuffer | Uint8Array;
}

/**
 * Create a ZIP Blob from an array of entries using JSZip.
 * Returns a Blob suitable for download or writing to the File System Access API.
 */
export async function createZip(entries: ZipEntry[], options?: { compression?: 'DEFLATE' | 'STORE' }) {
  // Use dynamic import to avoid static dependency resolution in the TS environment
  const JSZipModule = await import('jszip');
  // The package exports a default
  const JSZip = JSZipModule.default ?? JSZipModule;
  const zip = new JSZip();

  const compression = options?.compression ?? 'DEFLATE';

  for (const e of entries) {
    zip.file(e.name, e.data, { compression });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return blob as Blob;
}

// named export only; prefer dynamic import so consumers can keep bundle small


