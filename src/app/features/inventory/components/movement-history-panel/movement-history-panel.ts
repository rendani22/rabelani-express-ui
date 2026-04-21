import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerHistory,
  tablerX,
  tablerPackage,
  tablerTrendingUp,
  tablerTrendingDown,
  tablerMinus,
  tablerDownload,
} from '@ng-icons/tabler-icons';

import {
  InventoryItem,
  InventoryMovement,
  InventoryMovementSource,
  InventoryService,
} from '../../../../core';
import { downloadCsv, toCsv, yyyymmdd } from '../../utils/csv.util';
import {
  formatDateTime,
  formatDelta,
  getDeltaClass,
  getDeltaIconName,
  getSourceBadgeClass,
  getSourceLabel,
} from '../../utils/movement-format.util';

@Component({
  selector: 'app-movement-history-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NgIcon],
  viewProviders: [
    provideIcons({
      tablerHistory,
      tablerX,
      tablerPackage,
      tablerTrendingUp,
      tablerTrendingDown,
      tablerMinus,
      tablerDownload,
    }),
  ],
  templateUrl: './movement-history-panel.html',
  styleUrl: './movement-history-panel.css',
})
export class MovementHistoryPanelComponent {
  private readonly inventoryService = inject(InventoryService);

  readonly isOpen = input.required<boolean>();
  readonly item = input<InventoryItem | null>(null);

  readonly closePanel = output<void>();

  readonly movements = signal<InventoryMovement[]>([]);
  readonly loadingMovements = signal(false);

  /** Current item id for tracking changes */
  private readonly currentItemId = computed(() => this.item()?.id ?? null);

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const id = this.currentItemId();
      if (open && id) {
        void this.fetchMovements(id);
      } else if (!open) {
        this.movements.set([]);
      }
    });
  }

  onClose(): void {
    this.closePanel.emit();
  }

  private async fetchMovements(itemId: string): Promise<void> {
    this.loadingMovements.set(true);
    try {
      const data = await this.inventoryService.loadMovements(itemId);
      // Only set if still viewing the same item
      if (this.currentItemId() === itemId) {
        this.movements.set(data);
      }
    } finally {
      this.loadingMovements.set(false);
    }
  }

  // =========================================================================
  // CSV export
  // =========================================================================

  onExportCsv(): void {
    const rows = this.movements();
    if (rows.length === 0) return;

    const csv = toCsv(
      rows.map(m => ({
        created_at: m.created_at,
        source: m.source,
        delta: m.delta,
        quantity_before: m.quantity_before,
        quantity_after: m.quantity_after,
        reference: m.reference ?? '',
        note: m.note ?? '',
      })),
      ['created_at', 'source', 'delta', 'quantity_before', 'quantity_after', 'reference', 'note'],
    );

    const item = this.item();
    const slug = (item?.sku || item?.name || item?.id || 'item')
      .toString()
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    downloadCsv(`movements-${slug}-${yyyymmdd()}.csv`, csv);
  }

  // =========================================================================
  // Template helpers (delegate to shared utilities)
  // =========================================================================

  getSourceLabel(source: InventoryMovementSource): string { return getSourceLabel(source); }
  getSourceBadgeClass(source: InventoryMovementSource): string { return getSourceBadgeClass(source); }
  getTimelineDotClass(source: InventoryMovementSource): string {
    switch (source) {
      case 'initial':        return 'bg-gray-400 dark:bg-gray-500';
      case 'manual_edit':    return 'bg-amber-500';
      case 'package_deduct': return 'bg-violet-500';
      case 'restock':        return 'bg-emerald-500';
      default:               return 'bg-gray-400';
    }
  }
  getDeltaClass(delta: number): string { return getDeltaClass(delta); }
  getDeltaIconName(delta: number): string { return getDeltaIconName(delta); }
  formatDelta(delta: number): string { return formatDelta(delta); }
  formatDateTime(iso: string): string { return formatDateTime(iso); }
}

