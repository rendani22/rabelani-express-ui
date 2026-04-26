import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerArrowLeft,
  tablerDownload,
  tablerHistory,
  tablerMinus,
  tablerPackage,
  tablerRefresh,
  tablerTrendingDown,
  tablerTrendingUp,
} from '@ng-icons/tabler-icons';

import { InventoryService, InventoryMovementSource, RecentMovement } from '../../../core';
import { LayoutComponent } from '../../../shared/components/layout/layout.component';
import { downloadCsv, toCsv, yyyymmdd } from '../utils/csv.util';
import {
  formatDateTime,
  formatDelta,
  getDeltaClass,
  getDeltaIconName,
  getSourceBadgeClass,
  getSourceLabel,
} from '../utils/movement-format.util';

@Component({
  selector: 'app-recent-movements',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, LayoutComponent, NgIcon],
  viewProviders: [
    provideIcons({
      tablerArrowLeft,
      tablerDownload,
      tablerHistory,
      tablerMinus,
      tablerPackage,
      tablerRefresh,
      tablerTrendingDown,
      tablerTrendingUp,
    }),
  ],
  templateUrl: './recent-movements.html',
  styleUrl: './recent-movements.css',
})
export class RecentMovementsComponent implements OnInit {
  private readonly inventoryService = inject(InventoryService);

  readonly movements = signal<RecentMovement[]>([]);
  readonly loading = signal(false);

  private readonly limit = 100;

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.inventoryService.loadRecentMovements(this.limit);
      this.movements.set(data);
    } finally {
      this.loading.set(false);
    }
  }

  onExportCsv(): void {
    const rows = this.movements();
    if (rows.length === 0) return;

    const csv = toCsv(
      rows.map(m => ({
        created_at: m.created_at,
        item_name: m.item?.name ?? '',
        item_sku: m.item?.sku ?? '',
        unit: m.item?.unit ?? '',
        source: m.source,
        delta: m.delta,
        quantity_before: m.quantity_before,
        quantity_after: m.quantity_after,
        reference: m.reference ?? '',
        note: m.note ?? '',
      })),
      [
        'created_at',
        'item_name',
        'item_sku',
        'unit',
        'source',
        'delta',
        'quantity_before',
        'quantity_after',
        'reference',
        'note',
      ],
    );

    downloadCsv(`inventory-movements-${yyyymmdd()}.csv`, csv);
  }

  // Template helpers
  getSourceLabel(source: InventoryMovementSource): string { return getSourceLabel(source); }
  getSourceBadgeClass(source: InventoryMovementSource): string { return getSourceBadgeClass(source); }
  getDeltaClass(delta: number): string { return getDeltaClass(delta); }
  getDeltaIconName(delta: number): string { return getDeltaIconName(delta); }
  formatDelta(delta: number): string { return formatDelta(delta); }
  formatDateTime(iso: string): string { return formatDateTime(iso); }
}

