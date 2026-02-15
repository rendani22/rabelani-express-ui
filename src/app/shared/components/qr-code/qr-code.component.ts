import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QRCodeComponent } from 'angularx-qrcode';
import { SafeUrl } from '@angular/platform-browser';

/**
 * QR Code component for generating and displaying QR codes.
 * Uses angularx-qrcode library for QR code generation.
 *
 * @example
 * <app-qr-code
 *   [data]="'https://example.com'"
 *   [size]="200"
 *   [errorCorrectionLevel]="'M'"
 *   [showDownloadButton]="true"
 *   (qrCodeGenerated)="onQrGenerated($event)">
 * </app-qr-code>
 */
@Component({
  selector: 'app-qr-code',
  standalone: true,
  imports: [CommonModule, QRCodeComponent],
  template: `
    <div class="qr-code-container flex flex-col items-center">
      <!-- QR Code Display -->
      <div
        class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600"
        [class.dark:bg-gray-700]="darkBackground">
        <qrcode
          [qrdata]="data"
          [width]="size"
          [errorCorrectionLevel]="errorCorrectionLevel"
          [margin]="margin"
          [colorDark]="colorDark"
          [colorLight]="colorLight"
          [cssClass]="cssClass"
          [elementType]="elementType"
          [alt]="alt"
          (qrCodeURL)="onQrCodeGenerated($event)">
        </qrcode>
      </div>

      <!-- Optional Label -->
      <span
        *ngIf="label"
        class="mt-2 text-sm text-gray-600 dark:text-gray-300 text-center">
        {{ label }}
      </span>

      <!-- Download Button -->
      <button
        *ngIf="showDownloadButton && qrCodeUrl"
        (click)="downloadQrCode()"
        class="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400
               bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50
               rounded-lg transition-colors border border-violet-200 dark:border-violet-700">
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
          <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
        </svg>
        {{ downloadButtonText }}
      </button>
    </div>
  `
})
export class QrCodeComponent {
  /** The data to encode in the QR code (URL, text, etc.) */
  @Input() data: string = '';

  /** Size of the QR code in pixels */
  @Input() size: number = 200;

  /** Error correction level: L (7%), M (15%), Q (25%), H (30%) */
  @Input() errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' = 'M';

  /** Margin around the QR code (in modules) */
  @Input() margin: number = 4;

  /** Color of the dark modules */
  @Input() colorDark: string = '#000000';

  /** Color of the light modules */
  @Input() colorLight: string = '#ffffff';

  /** Optional CSS class for the QR code element */
  @Input() cssClass: string = '';

  /** Element type: 'canvas', 'svg', or 'img' */
  @Input() elementType: 'canvas' | 'svg' | 'img' = 'canvas';

  /** Alt text for accessibility */
  @Input() alt: string = 'QR Code';

  /** Optional label to display below the QR code */
  @Input() label: string = '';

  /** Whether to show the download button */
  @Input() showDownloadButton: boolean = false;

  /** Text for the download button */
  @Input() downloadButtonText: string = 'Download';

  /** Whether to apply dark background styling */
  @Input() darkBackground: boolean = false;

  /** Emits the generated QR code data URL */
  @Output() qrCodeGenerated = new EventEmitter<SafeUrl>();

  /** Stores the generated QR code URL for download */
  qrCodeUrl: SafeUrl | null = null;

  /**
   * Called when the QR code is generated.
   * @param url The data URL of the generated QR code
   */
  onQrCodeGenerated(url: SafeUrl): void {
    this.qrCodeUrl = url;
    this.qrCodeGenerated.emit(url);
  }

  /**
   * Downloads the QR code as an image file.
   */
  downloadQrCode(): void {
    if (!this.qrCodeUrl) return;

    const link = document.createElement('a');
    link.href = this.qrCodeUrl.toString();
    link.download = `qr-code-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}



