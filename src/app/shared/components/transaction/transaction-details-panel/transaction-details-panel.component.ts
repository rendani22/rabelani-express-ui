import { Component, Input, Output, EventEmitter, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Transaction } from '../transaction.model';

@Component({
  selector: 'app-transaction-details-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      class="panel-overlay"
      [class.open]="isOpen"
      (click)="onClose()"
      *ngIf="isOpen"
    ></div>

    <aside
      class="details-panel"
      [class.open]="isOpen"
      *ngIf="transaction"
    >
      <div class="panel-content">
        <!-- Close Button -->
        <button class="close-btn" (click)="onClose()" aria-label="Close panel">
          <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path d="m7.95 6.536 4.242-4.243a1 1 0 1 1 1.415 1.414L9.364 7.95l4.243 4.242a1 1 0 1 1-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 0 1-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 0 1 1.414-1.414L7.95 6.536Z" />
          </svg>
        </button>

        <div class="panel-body">
          <!-- Header -->
          <div class="panel-header">
            <h2 class="title">Bank Transfer</h2>
            <div class="timestamp">{{ transaction.details?.timestamp || transaction.paymentDate }}</div>
          </div>

          <!-- Transaction Card -->
          <div class="transaction-card">
            <!-- Top Section -->
            <div class="card-top">
              <div class="avatar-wrapper">
                <img
                  [src]="transaction.counterpartyImage"
                  [alt]="transaction.counterparty"
                  class="transaction-avatar"
                />
              </div>
              @if (transaction.amount !== undefined) {
                <div
                  class="amount-display"
                  [class.credit]="transaction.amount > 0"
                  [class.debit]="transaction.amount < 0"
                >
                  {{ formatAmount(transaction.amount) }}
                </div>
              }
              <div class="counterparty-name">{{ transaction.counterparty }}</div>
              <span
                class="status-badge"
                [class.pending]="transaction.status === 'Pending'"
                [class.completed]="transaction.status === 'Completed'"
                [class.canceled]="transaction.status === 'Canceled'"
              >
                {{ transaction.status }}
              </span>
            </div>

            <!-- Divider -->
            <div class="card-divider" aria-hidden="true">
              <svg class="divider-cap left" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 20c5.523 0 10-4.477 10-10S5.523 0 0 0h20v20H0Z" />
              </svg>
              <div class="divider-line-wrapper">
                <div class="divider-line"></div>
              </div>
              <svg class="divider-cap right" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 20c5.523 0 10-4.477 10-10S5.523 0 0 0h20v20H0Z" />
              </svg>
            </div>

            <!-- Bottom Section - Transaction Details -->
            <div class="card-bottom" *ngIf="transaction.details">
              <div class="detail-row" *ngIf="transaction.details.iban">
                <span class="detail-label">IBAN:</span>
                <span class="detail-value">{{ transaction.details.iban }}</span>
              </div>
              <div class="detail-row" *ngIf="transaction.details.bic">
                <span class="detail-label">BIC:</span>
                <span class="detail-value">{{ transaction.details.bic }}</span>
              </div>
              <div class="detail-row" *ngIf="transaction.details.reference">
                <span class="detail-label">Reference:</span>
                <span class="detail-value">{{ transaction.details.reference }}</span>
              </div>
              <div class="detail-row" *ngIf="transaction.details.emitter">
                <span class="detail-label">Emitter:</span>
                <span class="detail-value">{{ transaction.details.emitter }}</span>
              </div>
            </div>
          </div>

          <!-- Receipts Section -->
          <div class="section">
            <h3 class="section-title">Receipts</h3>
            <div class="upload-area">
              <svg class="upload-icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 4c-.3 0-.5.1-.7.3L1.6 10 3 11.4l4-4V16h2V7.4l4 4 1.4-1.4-5.7-5.7C8.5 4.1 8.3 4 8 4ZM1 2h14V0H1v2Z" />
              </svg>
              <label for="receipt-upload" class="upload-label">
                We accept PNG, JPEG, and PDF files.
              </label>
              <input
                type="file"
                id="receipt-upload"
                class="file-input"
                accept=".png,.jpg,.jpeg,.pdf"
                (change)="onFileUpload($event)"
              />
            </div>

            <!-- Uploaded Receipts List -->
            <div class="receipts-list" *ngIf="uploadedReceipts().length > 0">
              <div
                *ngFor="let receipt of uploadedReceipts()"
                class="receipt-item"
              >
                <span class="receipt-name">{{ receipt }}</span>
                <button
                  class="btn-remove"
                  (click)="removeReceipt(receipt)"
                  aria-label="Remove receipt"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <!-- Notes Section -->
          <div class="section">
            <h3 class="section-title">Notes</h3>
            <textarea
              class="notes-textarea"
              rows="4"
              placeholder="Write a note…"
              [(ngModel)]="notes"
            ></textarea>
          </div>

          <!-- Actions -->
          <div class="actions">
            <button class="btn-action">
              <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 4c-.3 0-.5.1-.7.3L1.6 10 3 11.4l4-4V16h2V7.4l4 4 1.4-1.4-5.7-5.7C8.5 4.1 8.3 4 8 4ZM1 2h14V0H1v2Z" />
              </svg>
              <span>Download</span>
            </button>
            <button class="btn-action btn-danger">
              <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16">
                <path d="M7.001 3h2v4h-2V3Zm1 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM15 16a1 1 0 0 1-.6-.2L10.667 13H1a1 1 0 0 1-1-1V1a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1ZM2 11h9a1 1 0 0 1 .6.2L14 13V2H2v9Z" />
              </svg>
              <span>Report</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .panel-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 40;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .panel-overlay.open {
      opacity: 1;
    }

    .details-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-width: 420px;
      background: white;
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
      z-index: 50;
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
      overflow-y: auto;
    }

    .details-panel.open {
      transform: translateX(0);
    }

    .panel-content {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .close-btn {
      position: absolute;
      top: 1rem;
      right: 1rem;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: #6b7280;
      cursor: pointer;
      border-radius: 0.375rem;
      transition: all 0.15s;
      z-index: 10;
    }

    .close-btn:hover {
      background: #f3f4f6;
      color: #111827;
    }

    .close-btn svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    .panel-body {
      padding: 2rem 1.5rem;
      flex: 1;
    }

    .panel-header {
      margin-bottom: 2rem;
    }

    .title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #111827;
      margin: 0 0 0.25rem 0;
    }

    .timestamp {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .transaction-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      overflow: hidden;
      margin-bottom: 2rem;
    }

    .card-top {
      padding: 2rem;
      text-align: center;
      background: #fafafa;
    }

    .avatar-wrapper {
      margin-bottom: 1rem;
    }

    .transaction-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
    }

    .amount-display {
      font-size: 1.875rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .amount-display.credit {
      color: #059669;
    }

    .amount-display.debit {
      color: #111827;
    }

    .counterparty-name {
      font-size: 0.875rem;
      font-weight: 500;
      color: #111827;
      margin-bottom: 0.75rem;
    }

    .status-badge {
      display: inline-flex;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status-badge.pending {
      background: #fef3c7;
      color: #92400e;
    }

    .status-badge.completed {
      background: #d1fae5;
      color: #065f46;
    }

    .status-badge.canceled {
      background: #fee2e2;
      color: #991b1b;
    }

    .card-divider {
      display: flex;
      align-items: center;
      position: relative;
    }

    .divider-cap {
      flex-shrink: 0;
      fill: #e5e7eb;
    }

    .divider-cap.right {
      transform: rotate(180deg);
    }

    .divider-line-wrapper {
      flex: 1;
      display: flex;
      justify-content: center;
      background: white;
      padding: 0 1rem;
    }

    .divider-line {
      width: 100%;
      height: 1px;
      background: #e5e7eb;
      border-top: 2px dashed #e5e7eb;
    }

    .card-bottom {
      padding: 1.5rem;
      background: white;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
      margin-bottom: 0.75rem;
    }

    .detail-row:last-child {
      margin-bottom: 0;
    }

    .detail-label {
      color: #6b7280;
    }

    .detail-value {
      font-weight: 500;
      color: #111827;
      text-align: right;
    }

    .section {
      margin-bottom: 2rem;
    }

    .section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #111827;
      margin: 0 0 0.75rem 0;
    }

    .upload-area {
      border: 2px dashed #d1d5db;
      border-radius: 0.5rem;
      padding: 2rem 1rem;
      text-align: center;
      background: #fafafa;
      cursor: pointer;
      transition: all 0.15s;
    }

    .upload-area:hover {
      border-color: #9ca3af;
      background: #f3f4f6;
    }

    .upload-icon {
      width: 24px;
      height: 24px;
      margin: 0 auto 0.5rem;
      fill: #6b7280;
    }

    .upload-label {
      display: block;
      font-size: 0.875rem;
      color: #6b7280;
      cursor: pointer;
    }

    .file-input {
      display: none;
    }

    .receipts-list {
      margin-top: 1rem;
    }

    .receipt-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background: #f9fafb;
      border-radius: 0.375rem;
      margin-bottom: 0.5rem;
    }

    .receipt-name {
      font-size: 0.875rem;
      color: #111827;
    }

    .btn-remove {
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: #6b7280;
      font-size: 1.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.25rem;
      transition: all 0.15s;
    }

    .btn-remove:hover {
      background: #e5e7eb;
      color: #dc2626;
    }

    .notes-textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-family: inherit;
      resize: vertical;
      transition: border-color 0.15s;
    }

    .notes-textarea:focus {
      outline: none;
      border-color: #8b5cf6;
      box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
    }

    .actions {
      display: flex;
      gap: 0.75rem;
    }

    .btn-action {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      background: white;
      color: #374151;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-action:hover {
      background: #f9fafb;
      border-color: #9ca3af;
    }

    .btn-danger {
      color: #dc2626;
      border-color: #fca5a5;
    }

    .btn-danger:hover {
      background: #fef2f2;
      border-color: #f87171;
    }

    .btn-icon {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    @media (max-width: 768px) {
      .details-panel {
        max-width: 100%;
      }

      .panel-body {
        padding: 1.5rem 1rem;
      }
    }
  `]
})
export class TransactionDetailsPanelComponent {
  @Input() transaction: Transaction | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  notes = signal('');
  uploadedReceipts = signal<string[]>([]);

  constructor() {
    // Reset notes when transaction changes
    effect(() => {
      if (this.transaction) {
        this.notes.set(this.transaction.details?.notes || '');
        this.uploadedReceipts.set(this.transaction.details?.receipts || []);
      }
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  formatAmount(amount: number): string {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  onFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.uploadedReceipts.update(receipts => [...receipts, file.name]);
      console.log('File uploaded:', file.name);
      // Implement actual file upload logic here
    }
  }

  removeReceipt(receipt: string): void {
    this.uploadedReceipts.update(receipts =>
      receipts.filter(r => r !== receipt)
    );
  }
}

