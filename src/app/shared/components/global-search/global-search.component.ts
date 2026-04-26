import {
  Component,
  inject,
  signal,
  HostListener,
  ChangeDetectionStrategy,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { GlobalSearchService } from '../../services/global-search.service';

interface SearchHit {
  readonly type: 'package' | 'driver' | 'customer';
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly badge: string;
  readonly badgeColor: string;
  readonly route: string;
}

/**
 * Global search overlay (⌘K / Ctrl+K) that searches packages, drivers, and customers.
 *
 * Registered in AppComponent and activated via a keyboard shortcut.
 * Deep-links to the relevant list page when a result is clicked.
 */
@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './global-search.component.html',
  styleUrl: './global-search.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalSearchComponent implements OnDestroy {
  private readonly supabaseService = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly globalSearchService = inject(GlobalSearchService);

  readonly isOpen = this.globalSearchService.isOpen;
  readonly query = signal('');
  readonly results = signal<SearchHit[]>([]);
  readonly isSearching = signal(false);
  readonly selectedIndex = signal(-1);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // =========================================================================
  // Keyboard shortcut listener
  // =========================================================================

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.open();
      return;
    }

    if (!this.isOpen()) return;

    if (event.key === 'Escape') {
      this.close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex.update(i => Math.min(i + 1, this.results().length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex.update(i => Math.max(i - 1, -1));
    } else if (event.key === 'Enter') {
      const idx = this.selectedIndex();
      if (idx >= 0 && idx < this.results().length) {
        this.onResultClick(this.results()[idx]);
      }
    }
  }

  // =========================================================================
  // Public API
  // =========================================================================

  open(): void {
    this.globalSearchService.open();
    this.query.set('');
    this.results.set([]);
    this.selectedIndex.set(-1);
  }

  close(): void {
    this.globalSearchService.close();
  }

  onQueryChange(value: string): void {
    this.query.set(value);
    this.selectedIndex.set(-1);

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    if (!value.trim()) {
      this.results.set([]);
      return;
    }

    this.debounceTimer = setTimeout(() => void this.runSearch(value.trim()), 300);
  }

  onResultClick(hit: SearchHit): void {
    this.close();
    void this.router.navigate([hit.route]);
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  // =========================================================================
  // Search
  // =========================================================================

  private async runSearch(q: string): Promise<void> {
    this.isSearching.set(true);

    try {
      const [packages, drivers, customers] = await Promise.all([
        this.searchPackages(q),
        this.searchDrivers(q),
        this.searchCustomers(q),
      ]);

      this.results.set([...packages, ...drivers, ...customers].slice(0, 20));
    } catch {
      this.results.set([]);
    } finally {
      this.isSearching.set(false);
    }
  }

  private async searchPackages(q: string): Promise<SearchHit[]> {
    const { data } = await this.supabaseService.client
      .from('packages')
      .select('id, reference, receiver_email, status')
      .or(`reference.ilike.%${q}%,receiver_email.ilike.%${q}%`)
      .limit(5);

    return ((data ?? []) as { id: string; reference: string; receiver_email: string; status: string }[]).map(p => ({
      type: 'package' as const,
      id: p.id,
      title: p.reference,
      subtitle: p.receiver_email,
      badge: p.status,
      badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
      route: '/orders',
    }));
  }

  private async searchDrivers(q: string): Promise<SearchHit[]> {
    const { data } = await this.supabaseService.client
      .from('staff_profiles')
      .select('id, full_name, email, role')
      .eq('role', 'driver')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(5);

    return ((data ?? []) as { id: string; full_name: string; email: string; role: string }[]).map(d => ({
      type: 'driver' as const,
      id: d.id,
      title: d.full_name,
      subtitle: d.email,
      badge: 'Driver',
      badgeColor: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
      route: '/drivers',
    }));
  }

  private async searchCustomers(q: string): Promise<SearchHit[]> {
    const { data } = await this.supabaseService.client
      .from('receiver_profiles')
      .select('id, name, surname, email')
      .or(`name.ilike.%${q}%,surname.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(5);

    return ((data ?? []) as { id: string; name: string; surname: string; email: string }[]).map(c => ({
      type: 'customer' as const,
      id: c.id,
      title: `${c.name} ${c.surname}`,
      subtitle: c.email,
      badge: 'Customer',
      badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
      route: '/customers',
    }));
  }
}
