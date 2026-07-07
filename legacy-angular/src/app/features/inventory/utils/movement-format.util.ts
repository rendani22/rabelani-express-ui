import { InventoryMovementSource } from '../../../core';

export function getSourceLabel(source: InventoryMovementSource): string {
  switch (source) {
    case 'initial':        return 'Initial Stock';
    case 'manual_edit':    return 'Manual Edit';
    case 'package_deduct': return 'Package';
    case 'restock':        return 'Restock';
    default:               return source;
  }
}

export function getSourceBadgeClass(source: InventoryMovementSource): string {
  switch (source) {
    case 'initial':
      return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    case 'manual_edit':
      return 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300';
    case 'package_deduct':
      return 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300';
    case 'restock':
      return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
  }
}

export function getDeltaClass(delta: number): string {
  if (delta > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (delta < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-gray-500 dark:text-gray-400';
}

export function getDeltaIconName(delta: number): string {
  if (delta > 0) return 'tablerTrendingUp';
  if (delta < 0) return 'tablerTrendingDown';
  return 'tablerMinus';
}

export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

