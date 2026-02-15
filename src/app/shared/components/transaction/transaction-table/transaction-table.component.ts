import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Transaction } from '../transaction.model';

export type { Transaction } from '../transaction.model';

@Component({
  selector: 'app-transaction-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="table-container">
      <!-- Bulk Actions Bar (shown when items are selected) -->
      <div class="bulk-actions" *ngIf="_selectedIds().size > 0">
        <div class="selection-info">
          <span class="count">{{ _selectedIds().size }}</span> item(s) selected
        </div>
        <div class="actions">
          <button class="btn-action" (click)="exportSelected()">Export</button>
          <button class="btn-action btn-danger" (click)="deleteSelected()">Delete</button>
        </div>
      </div>

      <!-- Table -->
      <div class="table-wrapper">
        <table class="transactions-table">
          <thead>
            <tr>
              <th class="checkbox-col">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [checked]="allSelected()"
                    [indeterminate]="someSelected()"
                    (change)="toggleAll()"
                  />
                  <span class="sr-only">Select all</span>
                </label>
              </th>
              <th class="text-left">Reference</th>
              <th class="text-left">Receiver</th>
              <th class="text-left">Created Date</th>
              <th class="text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              *ngFor="let transaction of transactions"
              class="transaction-row"
              [class.selected]="_selectedIds().has(transaction.id)"
              (click)="onRowClick(transaction)"
            >
              <td class="checkbox-col">
                <label class="checkbox-label" (click)="$event.stopPropagation()">
                  <input
                    type="checkbox"
                    [checked]="_selectedIds().has(transaction.id)"
                    (change)="toggleSelection(transaction.id)"
                  />
                  <span class="sr-only">Select</span>
                </label>
              </td>
              <td class="reference-col">
                <span class="reference">{{ transaction.reference || '—' }}</span>
              </td>
              <td class="counterparty-col">
                <div class="counterparty-info">
                  <img
                    [src]="transaction.counterpartyImage"
                    [alt]="transaction.counterparty"
                    class="avatar"
                  />
                  <span class="name">{{ transaction.counterparty }}</span>
                </div>
              </td>
              <td class="date-col">
                <span class="date">{{ transaction.paymentDate }}</span>
              </td>
              <td class="status-col">
                <span
                  class="status-badge"
                  [class.pending]="transaction.status === 'Pending'"
                  [class.completed]="transaction.status === 'Completed'"
                  [class.canceled]="transaction.status === 'Canceled'"
                  [class.in-transit]="transaction.status === 'In Transit'"
                  [class.ready]="transaction.status === 'Ready'"
                >
                  {{ transaction.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .table-container {
      background: white;
      border-radius: 0.5rem;
      overflow: hidden;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
    }

    .bulk-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }

    .selection-info {
      font-size: 0.875rem;
      color: #374151;
    }

    .selection-info .count {
      font-weight: 600;
      color: #111827;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-action {
      padding: 0.5rem 1rem;
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

    .table-wrapper {
      overflow-x: auto;
    }

    .transactions-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    thead {
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }

    th {
      padding: 0.75rem 1.5rem;
      text-align: left;
      font-size: 0.75rem;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .checkbox-col {
      width: 48px;
      padding-left: 1.5rem;
    }

    .text-right {
      text-align: right;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      cursor: pointer;
    }

    .checkbox-label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      border: 1px solid #d1d5db;
      border-radius: 0.25rem;
      cursor: pointer;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    tbody tr {
      border-bottom: 1px solid #e5e7eb;
    }

    .transaction-row {
      transition: background 0.15s;
      cursor: pointer;
    }

    .transaction-row:hover {
      background: #f9fafb;
    }

    .transaction-row.selected {
      background: #eff6ff;
    }

    td {
      padding: 1rem 1.5rem;
    }

    .counterparty-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }

    .name {
      font-weight: 500;
      color: #111827;
    }

    .date {
      color: #6b7280;
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

    .status-badge.in-transit {
      background: #dbeafe;
      color: #1e40af;
    }

    .status-badge.ready {
      background: #e0e7ff;
      color: #3730a3;
    }

    .reference {
      font-weight: 500;
      color: #6366f1;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8125rem;
    }

    .amount {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .amount.credit {
      color: #059669;
    }

    .amount.debit {
      color: #111827;
    }

    @media (max-width: 768px) {
      th,
      td {
        padding: 0.75rem 1rem;
      }

      .avatar {
        width: 32px;
        height: 32px;
      }

      .transactions-table {
        font-size: 0.8125rem;
      }
    }

    @media (max-width: 480px) {
      th,
      td {
        padding: 0.5rem 0.75rem;
      }

      .checkbox-col {
        padding-left: 0.75rem;
        width: 40px;
      }

      .reference {
        font-size: 0.75rem;
      }

      .name {
        font-size: 0.8125rem;
      }

      .counterparty-info {
        gap: 0.5rem;
      }

      .avatar {
        width: 28px;
        height: 28px;
      }

      .status-badge {
        padding: 0.125rem 0.5rem;
        font-size: 0.625rem;
      }

      .bulk-actions {
        padding: 0.75rem 1rem;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .btn-action {
        padding: 0.375rem 0.75rem;
        font-size: 0.75rem;
      }
    }

    /* Dark mode styles */
    :host-context(.dark) .table-container {
      background: #1e293b;
    }

    :host-context(.dark) .bulk-actions {
      background: #0f172a;
      border-bottom-color: #334155;
    }

    :host-context(.dark) .selection-info {
      color: #94a3b8;
    }

    :host-context(.dark) .selection-info .count {
      color: #f1f5f9;
    }

    :host-context(.dark) .btn-action {
      background: #1e293b;
      border-color: #475569;
      color: #e2e8f0;
    }

    :host-context(.dark) .btn-action:hover {
      background: #334155;
      border-color: #64748b;
    }

    :host-context(.dark) thead {
      background: #0f172a;
      border-bottom-color: #334155;
    }

    :host-context(.dark) th {
      color: #94a3b8;
    }

    :host-context(.dark) tbody tr {
      border-bottom-color: #334155;
    }

    :host-context(.dark) .transaction-row:hover {
      background: #334155;
    }

    :host-context(.dark) .transaction-row.selected {
      background: #1e3a5f;
    }

    :host-context(.dark) .name {
      color: #f1f5f9;
    }

    :host-context(.dark) .date {
      color: #94a3b8;
    }

    :host-context(.dark) .reference {
      color: #818cf8;
    }

    :host-context(.dark) .checkbox-label input[type="checkbox"] {
      border-color: #475569;
      background: #1e293b;
    }
  `]
})
export class TransactionTableComponent {
  @Input() transactions: Transaction[] = [];

  /** Syncs external selection state with internal signal */
  @Input() set selectedIds(value: Set<string>) {
    this._selectedIds.set(new Set(value));
  }

  @Output() transactionSelected = new EventEmitter<Transaction>();
  @Output() selectionChanged = new EventEmitter<Set<string>>();

  protected readonly _selectedIds = signal<Set<string>>(new Set());

  allSelected = () =>
    this.transactions.length > 0 &&
    this.transactions.every(t => this._selectedIds().has(t.id));

  someSelected = () =>
    this._selectedIds().size > 0 && !this.allSelected();

  toggleAll(): void {
    const newSelection = new Set<string>();
    if (!this.allSelected()) {
      this.transactions.forEach(t => newSelection.add(t.id));
    }
    this._selectedIds.set(newSelection);
    this.selectionChanged.emit(newSelection);
  }

  toggleSelection(id: string): void {
    const newSelection = new Set(this._selectedIds());
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    this._selectedIds.set(newSelection);
    this.selectionChanged.emit(newSelection);
  }

  onRowClick(transaction: Transaction): void {
    this.transactionSelected.emit(transaction);
  }

  formatAmount(amount: number): string {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}$${Math.abs(amount).toFixed(2)}`;
  }

  exportSelected(): void {
    console.log('Export selected transactions:', Array.from(this._selectedIds()));
    // Implement export logic
  }

  deleteSelected(): void {
    if (confirm(`Delete ${this._selectedIds().size} transaction(s)?`)) {
      console.log('Delete selected transactions:', Array.from(this._selectedIds()));
      // Implement delete logic
    }
  }
}

