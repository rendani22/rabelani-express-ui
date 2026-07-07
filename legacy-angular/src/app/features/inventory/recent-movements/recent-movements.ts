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
import { StaffService } from '../../../core/services/staff.service';
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
  private readonly staffService = inject(StaffService);

  readonly movements = signal<RecentMovement[]>([]);
  readonly loading = signal(false);
  /** Map of user_id -> full_name for movements' authors (reactive) */
  readonly userNames = signal<Record<string, string>>({});

  private readonly limit = 100;

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.inventoryService.loadRecentMovements(this.limit);
      this.movements.set(data);
      // Resolve staff names for any movements authored by staff
      void this.resolveUserNamesForMovements(data);
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
        user_name: m.user_id ? this.userNames()[m.user_id] ?? '' : 'System',
        source: m.source,
        delta: m.delta,
        quantity_before: m.quantity_before,
        quantity_after: m.quantity_after,
        reference: m.reference ?? '',
        note: m.note ?? '',
      })),
      [
        'created_at',
        'user_name',
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

  // Returns the display name for a user_id (or 'System' when null)
  getUserDisplay(userId: string | null): string {
    if (!userId) return 'System';
    return this.userNames()[userId] ?? '—';
  }

  private async resolveUserNamesForMovements(rows: RecentMovement[]): Promise<void> {
    const ids = Array.from(new Set(rows.map(r => r.user_id).filter((id): id is string => !!id)));
    if (ids.length === 0) return;

    const known = this.userNames();
    const toFetch = ids.filter(id => !(id in known));
    if (toFetch.length === 0) return;

    // Try a single batched query. This will succeed only if RLS permits the
    // current role to SELECT from `staff_profiles`. If it fails or returns an
    // empty array, we fall back to per-id placeholders so the UI is still
    // useful.
    try {
      const profiles = await this.staffService.getStaffByIds(toFetch);
      const map = new Map(profiles.map(p => [p.user_id, p.full_name] as const));

      for (const id of toFetch) {
        const name = map.get(id) ?? `Staff (${id.slice(0, 8)})`;
        this.userNames.update(prev => ({ ...prev, [id]: name }));
      }
    } catch {
      // If the batched fetch throws for any reason, ensure placeholders are set
      for (const id of toFetch) {
        this.userNames.update(prev => ({ ...prev, [id]: `Staff (${id.slice(0, 8)})` }));
      }
    }
  }
}

