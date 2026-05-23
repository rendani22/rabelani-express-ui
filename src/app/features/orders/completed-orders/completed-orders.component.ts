import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransactionTableComponent } from '../../../shared/components/transaction/transaction-table/transaction-table.component';
import type { Transaction } from '../../../shared/components/transaction/transaction-table/transaction-table.component';
import { PackageService, PACKAGE_STATUS } from '../../../core';

@Component({
  selector: 'app-completed-orders',
  standalone: true,
  imports: [CommonModule, TransactionTableComponent],
  templateUrl: './completed-orders.component.html',
  styleUrls: ['./completed-orders.component.css']
})
export class CompletedOrdersComponent {
  private readonly packageService = inject(PackageService);

  readonly startDate = signal<string>('');
  readonly endDate = signal<string>('');
  readonly selectedIds = signal<Set<string>>(new Set());

  readonly filteredTransactions = computed<Transaction[]>(() => {
    const pkgs = this.packageService.packages().filter(p => p.status === PACKAGE_STATUS.DELIVERED);
    const start = this.startDate() ? new Date(this.startDate()).setHours(0,0,0,0) : NaN;
    const end = this.endDate() ? new Date(this.endDate()).setHours(0,0,0,0) : NaN;

    return pkgs.filter(pkg => {
      const iso = pkg.updated_at ?? pkg.created_at ?? '';
      const d = new Date(iso);
      const day = Number.isNaN(d.getTime()) ? NaN : d.setHours(0,0,0,0);
      if (!Number.isNaN(start) && !Number.isNaN(day) && day < start) return false;
      if (!Number.isNaN(end) && !Number.isNaN(day) && day > end) return false;
      return true;
    }).map(pkg => {
      const iso = pkg.updated_at ?? pkg.created_at ?? '';
      const displayName = (pkg.receiver_email ?? '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return {
        id: pkg.id,
        reference: pkg.reference,
        orderNumber: pkg.po_number ?? undefined,
        counterparty: displayName,
        counterpartyImage: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&size=64`,
        paymentDate: new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        paymentDateIso: iso,
        lastUpdated: new Date(iso).toLocaleString(),
        lastUpdatedIso: iso,
        status: 'Completed'
      } as Transaction;
    });
  });

  clearFilters(): void {
    this.startDate.set('');
    this.endDate.set('');
  }
}
