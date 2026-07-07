import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Package } from '../../../core';

/**
 * Filesystem-like view for orders: grouped by created date (day) then PO number.
 * Standalone component so it can be reused anywhere the grouped view is needed.
 */
@Component({
  selector: 'app-orders-file-system-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './orders-file-system-view.html',
  styleUrls: ['./orders-file-system-view.css']
})
export class OrdersFileSystemViewComponent {
  @Input() packages: readonly Package[] = [];
  @Output() packageSelected = new EventEmitter<Package>();
  // Emit the set of selected package ids when selection changes
  @Output() selectionChanged = new EventEmitter<readonly string[]>();

  // Local selection state (package ids)
  readonly selectedIds = signal<Set<string>>(new Set());

  // Expanded state for date groups (keys are ISO yyyy-mm-dd strings)
  readonly expandedDates = signal<Set<string>>(new Set());
  // Expanded PO groups per date: Map<dateKey, Set<poNumber>>
  readonly expandedPos = signal<Map<string, Set<string>>>(new Map());

  toggleDate(dateKey: string): void {
    const next = new Set(this.expandedDates());
    if (next.has(dateKey)) next.delete(dateKey); else next.add(dateKey);
    this.expandedDates.set(next);
  }

  /**
   * Return all package ids for a date group
   */
  private getPackageIdsForDate(dateKey: string): string[] {
    const group = this.getGrouped().find(g => g.dateKey === dateKey);
    if (!group) return [];
    const ids: string[] = [];
    for (const po of group.pos) {
      for (const p of po.rows) ids.push(p.id);
    }
    return ids;
  }

  /** Number of selected packages for a date */
  selectedCount(dateKey: string): number {
    const ids = this.getPackageIdsForDate(dateKey);
    if (!ids.length) return 0;
    let cnt = 0;
    const sel = this.selectedIds();
    for (const id of ids) if (sel.has(id)) cnt++;
    return cnt;
  }

  /** Total number of packages for a date */
  totalCount(dateKey: string): number {
    return this.getPackageIdsForDate(dateKey).length;
  }

  isDateFullySelected(dateKey: string): boolean {
    const ids = this.getPackageIdsForDate(dateKey);
    if (ids.length === 0) return false;
    for (const id of ids) if (!this.selectedIds().has(id)) return false;
    return true;
  }

  isDatePartiallySelected(dateKey: string): boolean {
    const ids = this.getPackageIdsForDate(dateKey);
    if (ids.length === 0) return false;
    let any = false; let all = true;
    for (const id of ids) {
      if (this.selectedIds().has(id)) any = true;
      else all = false;
    }
    return any && !all;
  }

  toggleDateSelection(dateKey: string, event?: Event): void {
    if (event) event.stopPropagation();
    const ids = this.getPackageIdsForDate(dateKey);
    if (ids.length === 0) return;
    const next = new Set(this.selectedIds());
    const fully = this.isDateFullySelected(dateKey);
    if (fully) {
      // Deselect all
      for (const id of ids) next.delete(id);
    } else {
      // Select all
      for (const id of ids) next.add(id);
    }
    this.selectedIds.set(next);
    const out = Array.from(next);
    console.debug('[OrdersFileSystemView] selectionChanged emit (date)', out);
    this.selectionChanged.emit(out);
  }

  togglePo(dateKey: string, po: string): void {
    const map = new Map(this.expandedPos());
    const set = new Set(map.get(dateKey) ?? []);
    if (set.has(po)) set.delete(po); else set.add(po);
    map.set(dateKey, set);
    this.expandedPos.set(map);
  }

  isDateExpanded(dateKey: string): boolean {
    return this.expandedDates().has(dateKey);
  }

  isPoExpanded(dateKey: string, po: string): boolean {
    return (this.expandedPos().get(dateKey) ?? new Set()).has(po);
  }

  /**
   * Group packages by date (yyyy-mm-dd) and then by PO number.
   * Returns an array sorted by date desc, and PO numbers alphabetically.
   */
  getGrouped(): { dateKey: string; dateLabel: string; pos: { po: string; rows: Package[] }[] }[] {
    const groups = new Map<string, Map<string, Package[]>>();

    for (const p of this.packages ?? []) {
      const d = new Date(p.created_at);
      if (Number.isNaN(d.getTime())) continue;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}-${mm}-${dd}`;
      const po = (p.po_number ?? '—').toString();

      if (!groups.has(dateKey)) groups.set(dateKey, new Map());
      const poMap = groups.get(dateKey)!;
      if (!poMap.has(po)) poMap.set(po, []);
      poMap.get(po)!.push(p);
    }

    // Build array sorted by date desc
    const result: { dateKey: string; dateLabel: string; pos: { po: string; rows: Package[] }[] }[] = [];
    const dateKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
    for (const dk of dateKeys) {
      const poMap = groups.get(dk)!;
      const pos = Array.from(poMap.keys()).sort((a, b) => (a === '—' ? 1 : a.localeCompare(b))).map(po => ({ po, rows: poMap.get(po)! }));
      // Format date label from dateKey
      const [y, m, d] = dk.split('-');
      const dateLabel = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      result.push({ dateKey: dk, dateLabel, pos: pos });
    }

    return result;
  }

  openPackage(pkg: Package): void {
    console.debug('[OrdersFileSystemView] openPackage', pkg?.id);
    this.packageSelected.emit(pkg);
  }

  toggleSelection(pkgId: string, event?: Event): void {
    if (event) event.stopPropagation();
    const next = new Set(this.selectedIds());
    if (next.has(pkgId)) next.delete(pkgId); else next.add(pkgId);
    this.selectedIds.set(next);
    // Emit a shallow copy to avoid external mutation
    const out = Array.from(next);
    console.debug('[OrdersFileSystemView] selectionChanged emit', out);
    this.selectionChanged.emit(out);
  }

  isSelected(pkgId: string): boolean {
    return this.selectedIds().has(pkgId);
  }
}


