import { Injectable, signal } from '@angular/core';

/**
 * Singleton service that controls the visibility of the GlobalSearchComponent.
 * Inject this service anywhere to programmatically open or close the search overlay.
 */
@Injectable({ providedIn: 'root' })
export class GlobalSearchService {
  private readonly _isOpen = signal(false);

  /** Read-only signal reflecting whether the search overlay is currently open. */
  readonly isOpen = this._isOpen.asReadonly();

  open(): void {
    this._isOpen.set(true);
  }

  close(): void {
    this._isOpen.set(false);
  }
}

