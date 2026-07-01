import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Package,
  PackageItem,
  PACKAGE_STATUS,
  PackageStatus,
  PackageLockStatus,
  PodRecord,
  PackageService,
  StaffService,
  InventoryService,
  isPackageEditable,
  getAllowedManualStatusTransitions,
} from '../../../../core';
import { SupabaseService } from '../../../services/supabase.service';
import { ToastService } from '../../toast/toast.service';
import { ConfirmDialogComponent } from '../../confirm-dialog/confirm-dialog.component';

/** A single entry in the package status audit log */
interface StatusHistoryEntry {
  readonly status: string;
  readonly changed_at: string;
  readonly changed_by?: string;
  readonly note?: string;
}

/** A single package audit-log row (admin-only view) */
interface AuditLogEntry {
  readonly id: string;
  readonly action: string;
  readonly performed_by?: string;
  readonly metadata?: Record<string, unknown> | null;
  readonly created_at: string;
}

/** Fallback timeline entry derived from the package model when no history table exists */
interface TimelineEntry {
  readonly label: string;
  readonly timestamp: string | null;
  readonly color: string;
  readonly completed: boolean;
}

@Component({
  selector: 'app-package-details-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  template: `
    <!-- Backdrop -->
    @if (isOpen) {
      <div
        class="fixed inset-0 bg-gray-900/50 z-40 transition-opacity"
        (click)="onClose()"
        aria-hidden="true"
      ></div>
    }

    <!-- Slide-out Panel -->
    <aside
      class="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 transform transition-transform duration-300 ease-in-out overflow-hidden"
      [class.translate-x-0]="isOpen"
      [class.translate-x-full]="!isOpen"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="isOpen ? 'panel-title' : null"
    >
      @if (package; as pkg) {
        <div class="h-full flex flex-col">
          <!-- Header -->
          <header class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div class="flex items-center justify-between">
              <div>
                <h2 id="panel-title" class="text-lg font-semibold text-gray-900 dark:text-white">
                  Package Details
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  {{ pkg.reference }}
                </p>
              </div>
              <button
                type="button"
                class="p-2 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                (click)="onClose()"
                aria-label="Close panel"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                </svg>
              </button>
            </div>
          </header>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto">
            <!-- Status Card -->
            <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 rounded-full flex items-center justify-center" [ngClass]="getStatusBgClass(pkg.status)">
                    <svg class="w-6 h-6" [ngClass]="getStatusIconClass(pkg.status)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      @switch (pkg.status) {
                        @case ('collected') {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        }
                        @case ('delivered') {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        }
                        @case ('returned') {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        }
                        @case ('in_transit') {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"></path>
                        }
                        @case ('ready_for_collection') {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path>
                        }
                        @default {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        }
                      }
                    </svg>
                  </div>
                  <div>
                    <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium" [ngClass]="getStatusBadgeClass(pkg.status)">
                      {{ getStatusLabel(pkg.status) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Receiver Info -->
            <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Receiver
              </h3>
              <div class="flex items-center gap-3">
                <img
                  [src]="getAvatarUrl(pkg.receiver_email)"
                  [alt]="pkg.receiver_email"
                  class="w-10 h-10 rounded-full"
                />
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ getEmailName(pkg.receiver_email) }}
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ pkg.receiver_email }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Package Info -->
            <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Package Information
              </h3>
              <dl class="space-y-3">
                <div class="flex justify-between">
                  <dt class="text-sm text-gray-500 dark:text-gray-400">Reference</dt>
                  <dd class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{ pkg.reference }}</dd>
                </div>
                @if (pkg.po_number) {
                  <div class="flex justify-between">
                    <dt class="text-sm text-gray-500 dark:text-gray-400">PO Number</dt>
                    <dd class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{ pkg.po_number }}</dd>
                  </div>
                }
                <div class="flex justify-between">
                  <dt class="text-sm text-gray-500 dark:text-gray-400">Created</dt>
                  <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(pkg.created_at) }}</dd>
                </div>
                @if (pkg.updated_at) {
                  <div class="flex justify-between">
                    <dt class="text-sm text-gray-500 dark:text-gray-400">Last Updated</dt>
                    <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(pkg.updated_at) }}</dd>
                  </div>
                }
                @if (pkg.created_by) {
                  <div class="flex justify-between">
                    <dt class="text-sm text-gray-500 dark:text-gray-400">Created By</dt>
                    <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ createdByName() || pkg.created_by }}</dd>
                  </div>
                }
              </dl>
            </div>

            <!-- Package Items -->
            @if ((pkg.items && pkg.items.length > 0) || canEditItems()) {
              <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Items ({{ editMode() ? draftItems().length : (pkg.items?.length ?? 0) }})
                  </h3>
                  <div class="flex items-center gap-2">
                    @if (canEditItems() && !editMode()) {
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
                        (click)="enterEditMode()"
                        title="Edit items"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                        Edit
                      </button>
                    }
                    @if (!editMode() && pkg.items && pkg.items.length > 0) {
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                        (click)="printAllItemQrCodes()"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                        </svg>
                        Print All QR
                      </button>
                    }
                  </div>
                </div>

                @if (!editMode()) {
                  <ul class="space-y-2">
                    @for (item of pkg.items; track item.id) {
                      <li class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div class="flex-1">
                          <span class="text-sm text-gray-900 dark:text-white">{{ item.description }}</span>
                          <span class="text-sm font-medium text-gray-500 dark:text-gray-400 ml-2">× {{ item.quantity }}</span>
                        </div>
                        <button
                          type="button"
                          class="p-1.5 text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 transition-colors rounded"
                          (click)="printItemQrCode(item)"
                          title="Print QR Code"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                          </svg>
                        </button>
                      </li>
                    }
                  </ul>
                } @else {
                  <!-- Edit mode -->
                  <ul class="space-y-2">
                    @for (draft of draftItems(); track draft.id) {
                        <li
                          class="flex items-center gap-2 p-3 rounded-lg transition-colors"
                          [ngClass]="{
                            'bg-gray-50': !draft.deleted,
                            'dark:bg-gray-700/50': !draft.deleted,
                            'bg-red-50': draft.deleted,
                            'dark:bg-red-900/20': draft.deleted
                          }"
                        >
                        <div class="flex-1 min-w-0">
                          <p
                            class="text-sm text-gray-900 dark:text-white truncate"
                            [class.line-through]="draft.deleted"
                            [class.text-gray-400]="draft.deleted"
                            [title]="draft.description"
                          >
                            {{ draft.description }}
                          </p>
                          @if (draft.inventory_item_id && stockHintFor(draft.inventory_item_id) !== null) {
                            <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                              Stock: {{ stockHintFor(draft.inventory_item_id) }}
                              @if (draft.quantity > (originalQuantityFor(draft.id) ?? 0) + (stockHintFor(draft.inventory_item_id) ?? 0)) {
                                <span class="text-red-600 dark:text-red-400 ml-1">(insufficient)</span>
                              }
                            </p>
                          }
                        </div>

                        @if (!draft.deleted) {
                          <div class="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md">
                            <button
                              type="button"
                              class="px-2 py-1 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:text-gray-300 dark:disabled:text-gray-600"
                              [disabled]="draft.quantity <= 1"
                              (click)="decrementDraft(draft.id)"
                              aria-label="Decrease quantity"
                            >−</button>
                            <input
                              type="number"
                              class="w-12 text-center text-sm bg-transparent border-0 focus:outline-none focus:ring-0 text-gray-900 dark:text-white"
                              min="1"
                              [ngModel]="draft.quantity"
                              (ngModelChange)="setDraftQty(draft.id, $event)"
                            />
                            <button
                              type="button"
                              class="px-2 py-1 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                              (click)="incrementDraft(draft.id)"
                              aria-label="Increase quantity"
                            >+</button>
                          </div>
                          <button
                            type="button"
                            class="p-1.5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors rounded"
                            (click)="markDraftDeleted(draft.id)"
                            title="Remove item"
                            aria-label="Remove item"
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"></path>
                            </svg>
                          </button>
                        } @else {
                          <button
                            type="button"
                            class="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium"
                            (click)="undoDraftDelete(draft.id)"
                          >Undo</button>
                        }
                      </li>
                    }
                  </ul>

                  @if (itemEditError()) {
                    <p class="mt-2 text-xs text-red-600 dark:text-red-400">{{ itemEditError() }}</p>
                  }

                  <div class="flex items-center justify-end gap-2 mt-3">
                    <button
                      type="button"
                      class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                      [disabled]="savingItems()"
                      (click)="cancelEdit()"
                    >Cancel</button>
                    <button
                      type="button"
                      class="px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-md transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                      [disabled]="savingItems() || !hasDraftChanges() || !areDraftsValid()"
                      (click)="saveItemEdits()"
                    >
                      @if (savingItems()) { Saving… } @else { Save changes }
                    </button>
                  </div>
                }
              </div>
            }

            <!-- Notes -->
            @if (pkg.notes || canEditNotes()) {
              @let parsedNotes = parseNotes(pkg.notes);
              <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Notes
                  </h3>
                  @if (canEditNotes() && !editingNotes()) {
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
                      (click)="enterNotesEdit()"
                      title="Edit notes"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                      </svg>
                      {{ pkg.notes ? 'Edit' : 'Add' }}
                    </button>
                  }
                </div>

                @if (editingNotes()) {
                  <textarea
                    rows="4"
                    class="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Add a note for this order…"
                    [ngModel]="draftNotes()"
                    (ngModelChange)="draftNotes.set($event)"
                  ></textarea>
                  @if (notesEditError()) {
                    <p class="text-xs text-red-600 dark:text-red-400 mt-2">{{ notesEditError() }}</p>
                  }
                  <div class="flex items-center justify-end gap-2 mt-3">
                    <button
                      type="button"
                      class="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
                      [disabled]="savingNotes()"
                      (click)="cancelNotesEdit()"
                    >Cancel</button>
                    <button
                      type="button"
                      class="px-3 py-1.5 text-xs rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                      [disabled]="savingNotes()"
                      (click)="saveNotesEdit()"
                    >{{ savingNotes() ? 'Saving…' : 'Save' }}</button>
                  </div>
                } @else {

                @if (parsedNotes.photoUrls.length) {
                  <div class="mb-3">
                    <div class="flex items-center gap-2 mb-2">
                      <svg class="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      </svg>
                      <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Delivery Photo{{ parsedNotes.photoUrls.length > 1 ? 's' : '' }}
                      </span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      @for (url of parsedNotes.photoUrls; track url) {
                        <a
                          [href]="url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="group relative block rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-violet-500 dark:hover:border-violet-400 transition-colors bg-gray-100 dark:bg-gray-900"
                          title="Open delivery photo in a new tab"
                        >
                          <img
                            [src]="url"
                            alt="Delivery photo"
                            class="w-full h-32 object-cover"
                            loading="lazy"
                          />
                          <span class="absolute inset-0 flex items-center justify-center bg-gray-900/0 group-hover:bg-gray-900/40 transition-colors">
                            <svg class="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                            </svg>
                          </span>
                        </a>
                      }
                    </div>
                  </div>
                }

                @if (parsedNotes.text) {
                  <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ parsedNotes.text }}</p>
                } @else if (pkg.notes && !parsedNotes.photoUrls.length) {
                  <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ pkg.notes }}</p>
                } @else if (!parsedNotes.photoUrls.length) {
                  <p class="text-sm text-gray-400 dark:text-gray-500 italic">No notes yet.</p>
                }

                }
              </div>
            }

            <!-- Proof of Delivery -->
            @if (pkg.status === 'delivered' || pkg.status === 'collected') {
              <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Proof of Delivery
                </h3>
                @if (loadingPod()) {
                  <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    Loading POD…
                  </div>
                } @else if (hasPod()) {
                  <div class="rounded-lg border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-4 space-y-3">
                      <!-- POD reference -->
                    @if (pkg.po_number || pkg.reference || podStatus()?.podReference || podRecord()?.pod_reference) {
                      <div class="flex items-center justify-between">
                        <span class="text-xs text-gray-500 dark:text-gray-400">Purchase Order · Reference</span>
                        <span class="text-xs font-mono font-medium text-gray-900 dark:text-white">
                          @if (pkg.po_number && pkg.reference) {
                            Purchase Order {{ pkg.po_number }} · Reference {{ pkg.reference }}
                          } @else if (pkg.po_number) {
                            Purchase Order {{ pkg.po_number }}
                          } @else if (pkg.reference) {
                            Reference {{ pkg.reference }}
                          } @else {
                            {{ podStatus()?.podReference || podRecord()?.pod_reference }}
                          }
                        </span>
                      </div>
                    }
                    @if (podStatus()?.lockedAt || podRecord()?.locked_at || podRecord()?.completed_at) {
                      <div class="flex items-center justify-between">
                        <span class="text-xs text-gray-500 dark:text-gray-400">Signed At</span>
                        <span class="text-xs text-gray-900 dark:text-white">{{ formatDateTime((podStatus()?.lockedAt || podRecord()?.locked_at || podRecord()?.completed_at)!) }}</span>
                      </div>
                    }
                    <!-- Action buttons -->
                    <div class="flex gap-2 pt-1">
                      <button
                        type="button"
                        class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
                        (click)="onViewPodDocument()"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        View Document
                      </button>
                      @if (podStatus()?.pdfUrl) {
                        <a
                          [href]="podStatus()!.pdfUrl!"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-green-700 dark:text-green-400 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-600 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/40 transition-colors"
                        >
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                          </svg>
                          View PDF
                        </a>
                        <a
                          [href]="podStatus()!.pdfUrl!"
                          [download]="getPodFilename(pkg)"
                          class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                        >
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                          </svg>
                          Download
                        </a>
                      }
                    </div>
                  </div>
                } @else {
                  <p class="text-sm text-gray-500 dark:text-gray-400 italic">No POD document available for this package.</p>
                  @if (pkg.status === 'collected' || pkg.status === 'delivered') {
                    <button
                      type="button"
                      class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
                      (click)="onViewPodDocument()"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                      </svg>
                      View POD Document
                    </button>
                  }
                }
              </div>
            }

            <!-- Timeline / Activity Log -->
            <div class="px-6 py-5">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Activity
                </h3>
                @if (!loadingHistory() && statusHistory().length > 0) {
                  <span class="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    {{ statusHistory().length }} {{ statusHistory().length === 1 ? 'event' : 'events' }}
                  </span>
                }
              </div>

              @if (loadingHistory()) {
                <div class="flex items-center justify-center py-6">
                  <svg class="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                </div>
              } @else if (statusHistory().length > 0) {
                <!-- Supabase history entries -->
                <ol class="relative ml-1.5 space-y-4 border-l border-gray-200 dark:border-gray-700">
                  @for (entry of statusHistory(); track entry.changed_at) {
                    <li class="relative pl-4">
                      <span
                        class="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-800"
                        [class]="getHistoryDotColor(entry.status)"
                      ></span>
                      <div class="flex items-baseline justify-between gap-2">
                        <p class="text-sm font-medium text-gray-900 dark:text-white">{{ getStatusLabel(entry.status) }}</p>
                        <time class="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{{ formatDateTime(entry.changed_at) }}</time>
                      </div>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        @if (actorFor(entry.changed_by); as actor) {
                          <span [class.italic]="!actor.known">{{ actor.name }}</span>
                        } @else {
                          <span class="italic">System</span>
                        }
                      </p>
                      @if (entry.note) {
                        <p class="mt-0.5 text-xs italic text-gray-400 dark:text-gray-500">{{ entry.note }}</p>
                      }
                    </li>
                  }
                </ol>
              } @else {
                <!-- Derived timeline fallback -->
                <ol class="relative ml-1.5 space-y-4 border-l border-gray-200 dark:border-gray-700">
                  @for (entry of derivedTimeline(); track entry.label) {
                    @if (entry.completed) {
                      <li class="relative pl-4">
                        <span
                          class="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-800"
                          [class]="entry.color"
                        ></span>
                        <div class="flex items-baseline justify-between gap-2">
                          <p class="text-sm font-medium text-gray-900 dark:text-white">{{ entry.label }}</p>
                          @if (entry.timestamp) {
                            <time class="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{{ formatDateTime(entry.timestamp) }}</time>
                          }
                        </div>
                      </li>
                    }
                  }
                </ol>
              }
            </div>

            <!-- Audit Log (admin only) -->
            @if (isAdmin()) {
              <div class="px-6 py-5 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  class="flex w-full items-center justify-between text-left"
                  (click)="toggleAuditLog()"
                  [attr.aria-expanded]="auditOpen()"
                >
                  <span class="inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Audit Log
                    <span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">Admin</span>
                  </span>
                  <svg class="h-4 w-4 text-gray-400 transition-transform" [class.rotate-180]="auditOpen()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </button>

                @if (auditOpen()) {
                  <div class="mt-4">
                    @if (loadingAudit()) {
                      <div class="flex items-center justify-center py-6">
                        <svg class="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                      </div>
                    } @else if (auditLog().length > 0) {
                      <ol class="relative ml-1.5 space-y-4 border-l border-gray-200 dark:border-gray-700">
                        @for (entry of auditLog(); track entry.id) {
                          <li class="relative pl-4">
                            <span class="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-gray-300 ring-2 ring-white dark:bg-gray-600 dark:ring-gray-800"></span>
                            <div class="flex items-baseline justify-between gap-2">
                              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ formatAuditAction(entry.action) }}</p>
                              <time class="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{{ formatDateTime(entry.created_at) }}</time>
                            </div>
                            @if (auditStatusChange(entry); as change) {
                              <p class="text-xs text-gray-500 dark:text-gray-400">{{ change }}</p>
                            }
                            <p class="text-xs text-gray-500 dark:text-gray-400">
                              @if (actorFor(entry.performed_by); as actor) {
                                <span [class.italic]="!actor.known">{{ actor.name }}</span>
                              } @else {
                                <span class="italic">System</span>
                              }
                            </p>
                          </li>
                        }
                      </ol>
                    } @else {
                      <p class="text-sm italic text-gray-400 dark:text-gray-500">No audit entries.</p>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Footer Actions -->
          <footer class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-900/50 space-y-3">            <!-- Admin/Collection: manual status override (forward-only, excludes 'collected') -->
            @if (canManuallySetStatus(pkg.status) && manualStatusOptions().length > 0) {
              <div>
                <label
                  for="manual-status"
                  class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5"
                >
                  Change Status
                </label>
                <div class="flex items-center gap-2">
                  <select
                    id="manual-status"
                    class="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    [value]="selectedManualStatus()"
                    (change)="onManualStatusChange($event)"
                  >
                    <option value="" disabled>Select status…</option>
                    @for (status of manualStatusOptions(); track status) {
                      <option [value]="status">{{ getStatusLabel(status) }}</option>
                    }
                  </select>
                  <button
                    type="button"
                    class="px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg transition-colors"
                    [disabled]="!selectedManualStatus()"
                    (click)="onApplyManualStatus()"
                  >
                    Apply
                  </button>
                </div>
                <p class="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                  Marking as <span class="font-medium">Collected</span> requires the
                  proof-of-delivery flow below.
                </p>
              </div>
            }

            <div class="flex items-center justify-between gap-3">
              <button
                type="button"
                class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                (click)="onClose()"
              >
                Close
              </button>
              @if (canDeleteOrder()) {
                <button
                  type="button"
                  class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                  [disabled]="deletingOrder()"
                  (click)="onRequestDeleteOrder()"
                  title="Delete this order and return inventory"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"></path>
                  </svg>
                  @if (deletingOrder()) { Deleting… } @else { Delete }
                </button>
              }
              @if (pkg.status === 'delivered' || pkg.status === 'collected') {
                <button
                  type="button"
                  class="px-4 py-2 text-sm font-medium text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors flex items-center gap-2"
                  (click)="onViewPodDocument()"
                  title="View Proof of Delivery Document"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  POD Document
                </button>
              }
              @if (podStatus()?.pdfUrl && (pkg.status === 'delivered' || pkg.status === 'collected')) {
                <a
                  [href]="podStatus()!.pdfUrl!"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="px-4 py-2 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors flex items-center gap-2"
                  title="View Proof of Delivery"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  View POD
                </a>
              }
              @if (canUpdateStatus(pkg.status)) {
                <button
                  type="button"
                  class="flex-1 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
                  (click)="onUpdateStatus()"
                >
                  {{ getNextStatusAction(pkg.status) }}
                </button>
              }
            </div>
          </footer>
        </div>
      }
    </aside>

    <!-- Delete-order confirmation dialog -->
    <app-confirm-dialog
      [isOpen]="confirmDeleteOpen()"
      title="Delete order"
      [message]="deleteConfirmMessage()"
      confirmLabel="Move to deleted"
      [danger]="true"
      (confirmed)="onConfirmDeleteOrder()"
      (cancelled)="onCancelDeleteOrder()"
    ></app-confirm-dialog>
  `,
  styles: [`
    :host {
      display: contents;
    }
  `]
})
export class PackageDetailsPanelComponent implements OnChanges {
  private readonly supabaseService = inject(SupabaseService);
  private readonly packageService = inject(PackageService);
  private readonly staffService = inject(StaffService);
  private readonly inventoryService = inject(InventoryService);
  private readonly toastService = inject(ToastService);

  @Input() isOpen = false;
  @Input() package: Package | null = null;

  @Output() closePanel = new EventEmitter<void>();
  @Output() updateStatus = new EventEmitter<Package>();
  @Output() showQrCode = new EventEmitter<Package>();
  /** Emitted when the user opens the printable POD document. */
  @Output() viewPodDocument = new EventEmitter<Package>();
  /**
   * Emitted when an admin/collection user manually applies a new status
   * (any forward status except `collected`, which uses the POD modal flow).
   */
  @Output() setStatus = new EventEmitter<{ pkg: Package; status: PackageStatus }>();
  /**
   * Emitted with the fresh package after a successful items edit so the
   * parent (e.g. orders page) can refresh its local list / selection.
   */
  @Output() packageUpdated = new EventEmitter<Package>();

  /**
   * Emitted when the user confirms deletion of the current order. The parent
   * is responsible for calling the package service so the orders list and
   * inventory state can be refreshed together.
   */
  @Output() deleteOrder = new EventEmitter<Package>();

  /** True while a delete request is in flight (set by the parent). */
  @Input() set isDeletingOrder(value: boolean) {
    this.deletingOrder.set(value);
  }
  readonly deletingOrder = signal(false);

  /** Controls the delete-order confirmation dialog. */
  readonly confirmDeleteOpen = signal(false);

  /**
   * True when the current user is permitted to delete this order. Mirrors
   * `PackageService.canDeleteOrders` and requires a package to be loaded.
   */
  canDeleteOrder(): boolean {
    return !!this.package && this.packageService.canDeleteOrders();
  }

  /** Friendly message shown in the delete confirmation dialog. */
  deleteConfirmMessage(): string {
    const pkg = this.package;
    if (!pkg) return '';
    const itemCount = (pkg.items ?? []).filter(i => !!i.inventory_item_id).length;
    const ref = pkg.reference;
    const stockLine = itemCount > 0
      ? ` Stock for ${itemCount} inventory item${itemCount === 1 ? '' : 's'} will be returned to inventory.`
      : '';
    return (
      `Move order ${ref} to deleted?${stockLine} ` +
      `The order is hidden from the active list but kept in the recycle bin and can be restored later.`
    );
  }

  /** Open the delete-order confirmation dialog. */
  onRequestDeleteOrder(): void {
    if (!this.canDeleteOrder() || this.deletingOrder()) return;
    this.confirmDeleteOpen.set(true);
  }

  /** Cancel the delete-order confirmation dialog. */
  onCancelDeleteOrder(): void {
    this.confirmDeleteOpen.set(false);
  }

  /** Emit the delete request to the parent. */
  onConfirmDeleteOrder(): void {
    this.confirmDeleteOpen.set(false);
    if (!this.package || !this.canDeleteOrder()) return;
    this.deleteOrder.emit(this.package);
  }

  /** Status history loaded from Supabase */
  readonly statusHistory = signal<StatusHistoryEntry[]>([]);

  /** Loading state for history */
  readonly loadingHistory = signal(false);

  /**
   * Resolved staff details for the `changed_by` user ids referenced by the
   * status history, keyed by auth user id. Populated lazily after the history
   * loads so each activity entry can show who performed the action.
   */
  readonly historyActors = signal<Record<string, { name: string; email: string }>>({});

  /** True when the current user is an admin (gates the audit-log view). */
  readonly isAdmin = this.staffService.isAdmin;

  /** Package audit-log rows, loaded lazily when an admin expands the section. */
  readonly auditLog = signal<AuditLogEntry[]>([]);
  /** Loading state for the audit log. */
  readonly loadingAudit = signal(false);
  /** Whether the (admin-only) audit-log section is expanded. */
  readonly auditOpen = signal(false);

  /** POD lock status for delivered/collected packages */
  readonly podStatus = signal<PackageLockStatus | null>(null);

  /**
   * The full POD record from the `pods` table, if one exists.
   * A row may exist even when no PDF has been generated yet — in that
   * case `podStatus().pdfUrl` is null but the document can still be
   * rendered from the database via the printable POD modal.
   */
  readonly podRecord = signal<PodRecord | null>(null);

  /** True when either a lock-status with a PDF URL, or a POD row, exists. */
  hasPod(): boolean {
    return !!this.podStatus()?.pdfUrl || !!this.podRecord();
  }

  /** Loading state for POD status */
  readonly loadingPod = signal(false);

  /**
   * Resolved display name for the package's `created_by` user_id.
   * Looked up from `staff_profiles` so we show a human name instead of a UUID.
   */
  readonly createdByName = signal<string | null>(null);

  /** Currently selected status in the manual override dropdown */
  readonly selectedManualStatus = signal<PackageStatus | ''>('');

  // --------------------------------------------------------------------------
  // Items edit mode (pending/notified packages only)
  // --------------------------------------------------------------------------

  /** Whether the Items section is in edit mode. */
  readonly editMode = signal(false);
  /** Local draft of items being edited. `deleted=true` flags rows for removal. */
  readonly draftItems = signal<Array<{
    id: string;
    description: string;
    quantity: number;
    inventory_item_id: string | null;
    deleted: boolean;
  }>>([]);
  /** True while the save call is in flight. */
  readonly savingItems = signal(false);
  /** Inline error from the last save attempt (e.g. insufficient inventory). */
  readonly itemEditError = signal<string | null>(null);
  /** Snapshot of original quantities keyed by item id, used for stock-cap math. */
  private readonly originalQuantities = signal<Record<string, number>>({});

  /** True when the notes free-text is being edited inline. */
  readonly editingNotes = signal(false);
  /** Working copy of the notes text while editing. */
  readonly draftNotes = signal('');
  /** True while the notes save call is in flight. */
  readonly savingNotes = signal(false);
  /** Inline error from the last notes save attempt. */
  readonly notesEditError = signal<string | null>(null);

  /** True when the package is in a state where item edits are allowed. */
  canEditItems(): boolean {
    return !!this.package && isPackageEditable(this.package);
  }

  /**
   * True when the package notes may be edited from the UI — limited to the
   * `draft`, `pending` and `notified` statuses (same rule as item edits).
   */
  canEditNotes(): boolean {
    return !!this.package && isPackageEditable(this.package);
  }

  /** Look up the cached inventory stock for an item, if available. */
  stockHintFor(inventoryItemId: string): number | null {
    const item = this.inventoryService.items().find(i => i.id === inventoryItemId);
    return item ? item.quantity : null;
  }

  /** Original (pre-edit) quantity for a draft item id. */
  originalQuantityFor(id: string): number | null {
    return this.originalQuantities()[id] ?? null;
  }

  /** Returns true if the user has any pending changes vs the original items. */
  hasDraftChanges(): boolean {
    const drafts = this.draftItems();
    const originals = this.originalQuantities();
    return drafts.some(d => d.deleted || d.quantity !== (originals[d.id] ?? d.quantity));
  }

  /**
   * Validate drafts before save. Quantities must be positive integers; for
   * inventory-linked items, any *additional* consumption must not exceed the
   * cached stock (defensive — the server is the source of truth).
   *
   * Back-ordered items (stock <= 0) are still editable: decreases/removals are
   * always allowed, and further backordering is permitted so the server can
   * reconcile the negative inventory. The cap therefore only applies to
   * increases measured against genuinely-available (positive) stock.
   */
  areDraftsValid(): boolean {
    const drafts = this.draftItems();
    const originals = this.originalQuantities();
    for (const d of drafts) {
      if (d.deleted) continue;
      if (!Number.isInteger(d.quantity) || d.quantity < 1) return false;
      if (d.inventory_item_id) {
        const stock = this.stockHintFor(d.inventory_item_id);
        const original = originals[d.id] ?? 0;
        const additional = d.quantity - original;
        if (stock !== null && stock > 0 && additional > stock) return false;
      }
    }
    return true;
  }

  /** Enter edit mode and seed the draft from the current package items. */
  enterEditMode(): void {
    const pkg = this.package;
    if (!pkg || !this.canEditItems()) return;
    const items = pkg.items ?? [];
    this.draftItems.set(
      items.map(i => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        inventory_item_id: i.inventory_item_id ?? null,
        deleted: false,
      }))
    );
    this.originalQuantities.set(
      Object.fromEntries(items.map(i => [i.id, i.quantity]))
    );
    this.itemEditError.set(null);
    this.editMode.set(true);
    // Refresh inventory cache so stock hints are accurate.
    void this.inventoryService.loadItems();
  }

  /** Discard drafts and exit edit mode. */
  cancelEdit(): void {
    if (this.savingItems()) return;
    this.editMode.set(false);
    this.draftItems.set([]);
    this.originalQuantities.set({});
    this.itemEditError.set(null);
  }

  /** Mutate a draft row's quantity, clamped to >= 1. */
  setDraftQty(id: string, value: number | string): void {
    const next = Math.max(1, Math.floor(Number(value) || 1));
    this.draftItems.update(rows =>
      rows.map(r => (r.id === id ? { ...r, quantity: next } : r))
    );
  }

  incrementDraft(id: string): void {
    const row = this.draftItems().find(r => r.id === id);
    if (row) this.setDraftQty(id, row.quantity + 1);
  }

  decrementDraft(id: string): void {
    const row = this.draftItems().find(r => r.id === id);
    if (row) this.setDraftQty(id, row.quantity - 1);
  }

  /** Flag a draft row for removal (with a quick confirm). */
  markDraftDeleted(id: string): void {
    const row = this.draftItems().find(r => r.id === id);
    if (!row) return;
    if (typeof window !== 'undefined' && !window.confirm(`Remove "${row.description}" from this package?`)) {
      return;
    }
    this.draftItems.update(rows =>
      rows.map(r => (r.id === id ? { ...r, deleted: true } : r))
    );
  }

  /** Undo a pending deletion. */
  undoDraftDelete(id: string): void {
    this.draftItems.update(rows =>
      rows.map(r => (r.id === id ? { ...r, deleted: false } : r))
    );
  }

  /** Persist the items diff via the update-package edge function. */
  async saveItemEdits(): Promise<void> {
    const pkg = this.package;
    if (!pkg || !this.canEditItems() || this.savingItems()) return;
    if (!this.hasDraftChanges() || !this.areDraftsValid()) return;

    const drafts = this.draftItems();
    const originals = this.originalQuantities();
    const updates = drafts
      .filter(d => !d.deleted && d.quantity !== (originals[d.id] ?? d.quantity))
      .map(d => ({ id: d.id, quantity: d.quantity }));
    const deletes = drafts.filter(d => d.deleted).map(d => d.id);

    if (updates.length === 0 && deletes.length === 0) return;

    this.savingItems.set(true);
    this.itemEditError.set(null);

    try {
      const result = await this.packageService.updatePackage(pkg.id, {
        items: { updates, deletes },
      });

      if (!result.success) {
        const message = result.error || 'Failed to save changes.';
        this.itemEditError.set(message);
        this.toastService.error(message);
        return;
      }

      // The edge function already returns the package with embedded items,
      // but be defensive in case an older deployment doesn't — fall back to
      // a fresh fetch.
      let fresh = result.data.package as Package;
      if (!fresh.items) {
        const refetch = await this.packageService.getPackage(pkg.id);
        if (refetch.success) fresh = refetch.data;
      }

      this.package = fresh;
      this.packageUpdated.emit(fresh);

      // Refresh inventory so stock counts elsewhere in the app stay in sync.
      void this.inventoryService.loadItems();

      this.toastService.success(
        fresh.status === PACKAGE_STATUS.RETURNED
          ? 'All items removed. Order marked as canceled.'
          : 'Package items updated.'
      );
      this.editMode.set(false);
      this.draftItems.set([]);
      this.originalQuantities.set({});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error.';
      this.itemEditError.set(message);
      this.toastService.error(message);
    } finally {
      this.savingItems.set(false);
    }
  }

  /** Enter notes edit mode, seeding the draft from the current notes. */
  enterNotesEdit(): void {
    const pkg = this.package;
    if (!pkg || !this.canEditNotes()) return;
    this.draftNotes.set(pkg.notes ?? '');
    this.notesEditError.set(null);
    this.editingNotes.set(true);
  }

  /** Discard the notes draft and exit edit mode. */
  cancelNotesEdit(): void {
    if (this.savingNotes()) return;
    this.editingNotes.set(false);
    this.draftNotes.set('');
    this.notesEditError.set(null);
  }

  /** Persist the edited notes via the update-package edge function. */
  async saveNotesEdit(): Promise<void> {
    const pkg = this.package;
    if (!pkg || !this.canEditNotes() || this.savingNotes()) return;

    const next = this.draftNotes().trim();
    if (next === (pkg.notes ?? '').trim()) {
      this.cancelNotesEdit();
      return;
    }

    this.savingNotes.set(true);
    this.notesEditError.set(null);

    try {
      const result = await this.packageService.updatePackage(pkg.id, { notes: next });

      if (!result.success) {
        const message = result.error || 'Failed to save notes.';
        this.notesEditError.set(message);
        this.toastService.error(message);
        return;
      }

      this.package = result.data.package as Package;
      this.packageUpdated.emit(this.package);
      this.toastService.success('Notes updated.');
      this.editingNotes.set(false);
      this.draftNotes.set('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error.';
      this.notesEditError.set(message);
      this.toastService.error(message);
    } finally {
      this.savingNotes.set(false);
    }
  }

  /**
   * List of statuses an admin/collection user is allowed to set on the
   * current package (forward-only, excludes `collected`).
   *
   * Note: implemented as a method (not a `computed`) because `package` is a
   * plain `@Input`, not a signal — a computed wouldn't react to its changes.
   */
  manualStatusOptions(): readonly PackageStatus[] {
    const pkg = this.package;
    if (!pkg) return [];
    return getAllowedManualStatusTransitions(pkg.status);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const pkgChange = changes['package'];
    const openChange = changes['isOpen'];
    if ((pkgChange || openChange) && this.isOpen && this.package) {
      void this.loadStatusHistory(this.package.id);
      void this.loadCreatedByName(this.package.created_by);
      if (
        this.package.status === PACKAGE_STATUS.DELIVERED ||
        this.package.status === PACKAGE_STATUS.COLLECTED
      ) {
        void this.loadPodStatus(this.package.id);
      } else {
        this.podStatus.set(null);
        this.podRecord.set(null);
      }
    }
    // Reset the manual status dropdown whenever the selected package changes.
    if (pkgChange) {
      this.selectedManualStatus.set('');
      this.createdByName.set(null);
      // Exit any in-progress item edit when a different package is loaded.
      this.editMode.set(false);
      this.draftItems.set([]);
      this.originalQuantities.set({});
      this.itemEditError.set(null);
      // Collapse and clear the audit log so it reloads for the new package.
      this.auditOpen.set(false);
      this.auditLog.set([]);
    }
  }

  /**
   * Resolve the package's `created_by` user_id to a human-readable name
   * by looking it up in `staff_profiles`. Falls back silently to `null`
   * if no matching profile is found or the query fails — the template
   * will then display the raw user_id.
   */
  private async loadCreatedByName(userId: string | undefined | null): Promise<void> {
    if (!userId) {
      this.createdByName.set(null);
      return;
    }
    try {
      const { data, error } = await this.supabaseService.client
        .from('staff_profiles')
        .select('full_name, email')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) {
        this.createdByName.set(null);
        return;
      }

      const name = (data.full_name ?? '').trim() || (data.email ?? '').trim() || null;
      this.createdByName.set(name);
    } catch {
      this.createdByName.set(null);
    }
  }

  /**
   * Load the status change history from the package_status_history table.
   * Silently falls back to the derived timeline if the table doesn't exist
   * (e.g. the migration hasn't been applied yet) or the query fails.
   */
  private async loadStatusHistory(packageId: string): Promise<void> {
    this.loadingHistory.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('package_status_history')
        .select('status, changed_at, changed_by, note')
        .eq('package_id', packageId)
        .order('changed_at', { ascending: true });

      if (error) {
        // Table missing (PGRST205 / 42P01) or any other read error — just
        // fall back to the derived timeline without surfacing the failure.
        this.statusHistory.set([]);
        return;
      }

      const entries = (data ?? []) as StatusHistoryEntry[];
      this.statusHistory.set(entries);
      void this.resolveActorNames(entries.map(e => e.changed_by));
    } catch {
      this.statusHistory.set([]);
    } finally {
      this.loadingHistory.set(false);
    }
  }

  /**
   * Resolve a set of auth user ids to staff names and merge them into the
   * shared `historyActors` cache, so both the Activity timeline and the audit
   * log can attribute actions. Best-effort: on any failure (or RLS denial) the
   * ids simply remain unresolved and fall back to a neutral label. Ids already
   * cached are skipped.
   */
  private async resolveActorNames(rawIds: readonly (string | undefined)[]): Promise<void> {
    const existing = this.historyActors();
    const ids = [...new Set(rawIds.filter((v): v is string => !!v && !(v in existing)))];
    if (ids.length === 0) return;
    try {
      const { data, error } = await this.supabaseService.client
        .from('staff_profiles')
        .select('user_id, full_name, email')
        .in('user_id', ids);

      if (error || !data) return;

      const additions: Record<string, { name: string; email: string }> = {};
      for (const row of data as Array<{ user_id: string; full_name: string | null; email: string | null }>) {
        additions[row.user_id] = { name: row.full_name ?? '', email: row.email ?? '' };
      }
      this.historyActors.update(prev => ({ ...prev, ...additions }));
    } catch {
      /* best-effort — leave ids unresolved */
    }
  }

  /**
   * Load the package audit log (admin-only). Lazily invoked when the section
   * is first expanded. Reads directly from `audit_logs`; RLS already limits
   * this table to active staff, and the UI further gates the view to admins.
   */
  private async loadAuditLog(packageId: string): Promise<void> {
    this.loadingAudit.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('audit_logs')
        .select('id, action, performed_by, metadata, created_at')
        .eq('entity_type', 'package')
        .eq('entity_id', packageId)
        .order('created_at', { ascending: false });

      if (error || !data) {
        this.auditLog.set([]);
        return;
      }

      const entries = data as AuditLogEntry[];
      this.auditLog.set(entries);
      void this.resolveActorNames(entries.map(e => e.performed_by));
    } catch {
      this.auditLog.set([]);
    } finally {
      this.loadingAudit.set(false);
    }
  }

  /** Expand/collapse the audit-log section, loading it on first open. */
  toggleAuditLog(): void {
    const open = !this.auditOpen();
    this.auditOpen.set(open);
    if (open && this.package && this.auditLog().length === 0 && !this.loadingAudit()) {
      void this.loadAuditLog(this.package.id);
    }
  }

  /** Human-readable label for an audit action code. */
  formatAuditAction(action: string): string {
    const labels: Record<string, string> = {
      PACKAGE_CREATED: 'Package created',
      PACKAGE_UPDATED: 'Package updated',
      PACKAGE_ITEMS_UPDATED_NOTIFICATION: 'Items updated — receiver notified',
      PACKAGE_PREPARED_NOTIFICATION: 'Preparation email sent',
      PACKAGE_READY_NOTIFICATION: 'Ready-for-collection email sent',
      PACKAGE_COMPLETED_NOTIFICATION: 'Completion email sent',
      PACKAGE_UPDATE_DENIED: 'Update denied',
    };
    if (labels[action]) return labels[action];
    // Fallback: humanise the raw code (e.g. FOO_BAR -> "Foo bar").
    const words = action.toLowerCase().replace(/_/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /**
   * Extract a short "previous → new" status summary from an audit row's
   * metadata, when both are present and differ. Returns null otherwise.
   */
  auditStatusChange(entry: AuditLogEntry): string | null {
    const meta = entry.metadata;
    if (!meta) return null;
    const prev = meta['previous_status'];
    const next = meta['new_status'];
    if (typeof prev === 'string' && typeof next === 'string' && prev !== next) {
      return `${this.getStatusLabel(prev)} → ${this.getStatusLabel(next)}`;
    }
    return null;
  }

  /**
   * Resolve the display name + avatar initials for the actor of an activity
   * entry. Returns `null` for system-generated changes (no `changed_by`).
   */
  actorFor(changedBy?: string): { name: string; initials: string; known: boolean } | null {
    if (!changedBy) return null;
    const actor = this.historyActors()[changedBy];
    const name = (actor?.name || actor?.email || '').trim();
    if (!name) {
      return { name: 'Unknown user', initials: '?', known: false };
    }
    return { name, initials: this.initialsOf(name), known: true };
  }

  /** Build up-to-two-letter initials from a name or email for the avatar. */
  private initialsOf(value: string): string {
    const base = value.includes('@') ? value.split('@')[0] : value;
    const parts = base.trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * Load the POD lock status and the underlying POD record for a
   * delivered/collected package. The lock-status RPC tells us whether a
   * signed PDF exists; the POD row tells us whether the document can be
   * rendered from the database (signatures, receiver/witness details).
   */
  private async loadPodStatus(packageId: string): Promise<void> {
    this.loadingPod.set(true);
    try {
      const [status, record] = await Promise.all([
        this.packageService.getPackageLockStatus(packageId),
        this.packageService.getPodForPackage(packageId),
      ]);
      this.podStatus.set(status);
      this.podRecord.set(record);
    } catch {
      this.podStatus.set(null);
      this.podRecord.set(null);
    } finally {
      this.loadingPod.set(false);
    }
  }

  /**
   * Derives an ordered timeline from the current package status.
   * Used as fallback when no history table data is available.
   */
  derivedTimeline(): TimelineEntry[] {
    const pkg = this.package;
    if (!pkg) return [];

    const statusOrder: PackageStatus[] = pkg.status === PACKAGE_STATUS.RETURNED
      ? [PACKAGE_STATUS.PENDING, PACKAGE_STATUS.RETURNED]
      : [
          PACKAGE_STATUS.PENDING,
          PACKAGE_STATUS.NOTIFIED,
          PACKAGE_STATUS.IN_TRANSIT,
          PACKAGE_STATUS.READY_FOR_COLLECTION,
          PACKAGE_STATUS.COLLECTED,
        ];

    const currentIndex = statusOrder.indexOf(pkg.status as PackageStatus);

    const labels: Record<string, string> = {
      [PACKAGE_STATUS.DRAFT]: 'Draft',
      [PACKAGE_STATUS.PENDING]: 'Package created',
      [PACKAGE_STATUS.NOTIFIED]: 'Receiver notified',
      [PACKAGE_STATUS.IN_TRANSIT]: 'Driver picked up',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Arrived at collection point',
      [PACKAGE_STATUS.COLLECTED]: 'Package collected',
      [PACKAGE_STATUS.RETURNED]: 'Order canceled',
    };

    const colors: Record<string, string> = {
      [PACKAGE_STATUS.DRAFT]: 'bg-gray-400',
      [PACKAGE_STATUS.PENDING]: 'bg-yellow-500',
      [PACKAGE_STATUS.NOTIFIED]: 'bg-blue-500',
      [PACKAGE_STATUS.IN_TRANSIT]: 'bg-indigo-500',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'bg-purple-500',
      [PACKAGE_STATUS.COLLECTED]: 'bg-green-500',
      [PACKAGE_STATUS.RETURNED]: 'bg-red-500',
    };

    return statusOrder.map((status, index) => ({
      label: labels[status] ?? status,
      timestamp: index === 0
        ? pkg.created_at
        : index === currentIndex && pkg.updated_at
          ? pkg.updated_at
          : null,
      color: colors[status] ?? 'bg-gray-400',
      completed: index <= currentIndex,
    }));
  }

  /**
   * Returns a dot colour class for a history entry status.
   */
  getHistoryDotColor(status: string): string {
    const colors: Record<string, string> = {
      [PACKAGE_STATUS.DRAFT]: 'bg-gray-400',
      [PACKAGE_STATUS.PENDING]: 'bg-yellow-500',
      [PACKAGE_STATUS.NOTIFIED]: 'bg-blue-500',
      [PACKAGE_STATUS.IN_TRANSIT]: 'bg-indigo-500',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'bg-purple-500',
      [PACKAGE_STATUS.DELIVERED]: 'bg-green-500',
      [PACKAGE_STATUS.COLLECTED]: 'bg-green-600',
      [PACKAGE_STATUS.RETURNED]: 'bg-red-500',
    };
    return colors[status] ?? 'bg-gray-400';
  }

  onClose(): void {
    this.closePanel.emit();
  }

  onUpdateStatus(): void {
    if (this.package) {
      this.updateStatus.emit(this.package);
    }
  }

  /**
   * Whether the current user can manually set a package status via
   * the dropdown override (admin or collection roles only).
   */
  canManuallySetStatus(status: PackageStatus): boolean {
    // Final states cannot be changed.
    if (
      status === PACKAGE_STATUS.COLLECTED ||
      status === PACKAGE_STATUS.DELIVERED ||
      status === PACKAGE_STATUS.RETURNED
    ) {
      return false;
    }
    return this.staffService.isAdmin() || this.staffService.hasRole('collection');
  }

  /**
   * Handle dropdown selection change for manual status override.
   */
  onManualStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as PackageStatus | '';
    this.selectedManualStatus.set(value);
  }

  /**
   * Apply the selected manual status. Emits `setStatus` for the parent
   * to perform the update via the package service.
   */
  onApplyManualStatus(): void {
    const pkg = this.package;
    const status = this.selectedManualStatus();
    if (!pkg || !status) {
      return;
    }
    // Safety: never allow `collected` through this path.
    if (status === PACKAGE_STATUS.COLLECTED) {
      return;
    }
    this.setStatus.emit({ pkg, status });
    this.selectedManualStatus.set('');
  }

  onShowQrCode(): void {
    if (this.package) {
      this.showQrCode.emit(this.package);
    }
  }

  /** Emit a request to open the printable POD document for the current package. */
  onViewPodDocument(): void {
    if (this.package) {
      this.viewPodDocument.emit(this.package);
    }
  }

    getStatusLabel(status: PackageStatus | string): string {
    const labels: Record<string, string> = {
      [PACKAGE_STATUS.DRAFT]: 'Draft',
      [PACKAGE_STATUS.PENDING]: 'Pending',
      [PACKAGE_STATUS.NOTIFIED]: 'Notified',
      [PACKAGE_STATUS.IN_TRANSIT]: 'In Transit',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Ready for Collection',
      [PACKAGE_STATUS.DELIVERED]: 'Delivered',
      [PACKAGE_STATUS.COLLECTED]: 'Collected',
      [PACKAGE_STATUS.RETURNED]: 'Canceled',
    };

    // If we have a direct mapping, use it. Otherwise convert the status
    // (e.g. snake_case or lowercase) into Title Case → 'in_transit' -> 'In Transit'.
    if (labels[status]) return labels[status];

    if (typeof status !== 'string' || status.trim() === '') return '';

    return String(status)
      .replace(/[_-]+/g, ' ')
      .split(' ')
      .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .join(' ');
  }

  getStatusBadgeClass(status: PackageStatus): string {
    const classes: Record<PackageStatus, string> = {
      [PACKAGE_STATUS.DRAFT]: 'bg-gray-100 text-gray-800 dark:bg-gray-500/20 dark:text-gray-400',
      [PACKAGE_STATUS.PENDING]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-400',
      [PACKAGE_STATUS.NOTIFIED]: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400',
      [PACKAGE_STATUS.IN_TRANSIT]: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-400',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400',
      [PACKAGE_STATUS.DELIVERED]: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400',
      [PACKAGE_STATUS.COLLECTED]: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400',
      [PACKAGE_STATUS.RETURNED]: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400',
    };
    return classes[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-500/20 dark:text-gray-400';
  }

  getStatusBgClass(status: PackageStatus): string {
    const classes: Record<PackageStatus, string> = {
      [PACKAGE_STATUS.DRAFT]: 'bg-gray-100 dark:bg-gray-500/20',
      [PACKAGE_STATUS.PENDING]: 'bg-yellow-100 dark:bg-yellow-500/20',
      [PACKAGE_STATUS.NOTIFIED]: 'bg-blue-100 dark:bg-blue-500/20',
      [PACKAGE_STATUS.IN_TRANSIT]: 'bg-indigo-100 dark:bg-indigo-500/20',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'bg-purple-100 dark:bg-purple-500/20',
      [PACKAGE_STATUS.DELIVERED]: 'bg-green-100 dark:bg-green-500/20',
      [PACKAGE_STATUS.COLLECTED]: 'bg-green-100 dark:bg-green-500/20',
      [PACKAGE_STATUS.RETURNED]: 'bg-red-100 dark:bg-red-500/20',
    };
    return classes[status] || 'bg-gray-100 dark:bg-gray-500/20';
  }

  getStatusIconClass(status: PackageStatus): string {
    const classes: Record<PackageStatus, string> = {
      [PACKAGE_STATUS.DRAFT]: 'text-gray-600 dark:text-gray-400',
      [PACKAGE_STATUS.PENDING]: 'text-yellow-600 dark:text-yellow-400',
      [PACKAGE_STATUS.NOTIFIED]: 'text-blue-600 dark:text-blue-400',
      [PACKAGE_STATUS.IN_TRANSIT]: 'text-indigo-600 dark:text-indigo-400',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'text-purple-600 dark:text-purple-400',
      [PACKAGE_STATUS.DELIVERED]: 'text-green-600 dark:text-green-400',
      [PACKAGE_STATUS.COLLECTED]: 'text-green-600 dark:text-green-400',
      [PACKAGE_STATUS.RETURNED]: 'text-red-600 dark:text-red-400',
    };
    return classes[status] || 'text-gray-600 dark:text-gray-400';
  }

  canUpdateStatus(status: PackageStatus): boolean {
    // Final states cannot be updated.
    if (
      status === PACKAGE_STATUS.COLLECTED ||
      status === PACKAGE_STATUS.DELIVERED ||
      status === PACKAGE_STATUS.RETURNED
    ) {
      return false;
    }
    // Marking as collected requires admin or collection role.
    if (status === PACKAGE_STATUS.READY_FOR_COLLECTION) {
      return this.staffService.canMarkCollected();
    }
    return true;
  }

  getNextStatusAction(status: PackageStatus): string {
    const actions: Record<string, string> = {
      [PACKAGE_STATUS.DRAFT]: 'Mark as Notified',
      [PACKAGE_STATUS.PENDING]: 'Mark as Notified',
      [PACKAGE_STATUS.NOTIFIED]: 'Start Transit',
      [PACKAGE_STATUS.IN_TRANSIT]: 'Mark Ready',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Mark Collected',
    };
    return actions[status] || 'Update Status';
  }

  getAvatarUrl(email: string): string {
    const name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ');
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=64`;
  }

  getEmailName(email: string): string {
    return email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Parses a notes string and extracts any "Delivery photo: <url>" entries
   * (added automatically by the driver app when completing a delivery) so
   * they can be rendered as image previews instead of raw URLs.
   */
  parseNotes(notes: string | null | undefined): { photoUrls: string[]; text: string } {
    if (!notes) return { photoUrls: [], text: '' };

    const photoUrls: string[] = [];
    // Match patterns like "Delivery photo: https://..." (case-insensitive)
    const photoPattern = /delivery photo:\s*(https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif|heic)(?:\?\S*)?)/gi;
    let cleaned = notes.replace(photoPattern, (_match, url: string) => {
      photoUrls.push(url);
      return '';
    });

    // Fallback: capture bare image URLs (e.g. supabase storage delivery-photos paths)
    if (photoUrls.length === 0) {
      const bareImagePattern = /(https?:\/\/\S*delivery-photos\/\S+|https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif|heic)(?:\?\S*)?)/gi;
      cleaned = cleaned.replace(bareImagePattern, (url: string) => {
        photoUrls.push(url);
        return '';
      });
    }

    // Tidy up leftover separators / whitespace
    const text = cleaned
      .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { photoUrls, text };
  }

  /** Returns a filename for the POD PDF download. */
  getPodFilename(pkg: Package): string {
    const poSuffix = pkg.po_number ? `${pkg.po_number}` : '';
    return `${poSuffix}-${pkg.reference}.pdf`;
  }

  /**
   * Generates QR code data for a package item
   */
  private getItemQrData(item: PackageItem): string {
    const pkg = this.package;
    if (!pkg) return '';

    return JSON.stringify({
      itemId: item.id,
      packageId: pkg.id,
      packageReference: pkg.reference,
      description: item.description,
      quantity: item.quantity
    });
  }

  /**
   * Prints QR code for a specific item
   * Optimized for AIMO D520 Thermal Label Printer with 2.25" x 4" labels (57mm x 102mm)
   */
  printItemQrCode(item: PackageItem): void {
    const pkg = this.package;
    if (!pkg) return;

    const printWindow = window.open('', '_blank', 'width=280,height=450');
    if (!printWindow) return;

    const qrData = this.getItemQrData(item);
    // QR code rendered at higher pixel density for sharp scanning, displayed smaller via CSS
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(qrData)}`;

    const poNumberHtml = pkg.po_number ? `<div class="po-number">PO: ${pkg.po_number}</div>` : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Print QR Code - ${item.description}</title>
        <style>
          /*
           * AIMO D520 Thermal Label Printer
           * Label: 2.25" x 4" (57mm x 102mm)
           */
          @page {
            size: 2.25in 4in;
            margin: 0 !important;
            padding: 0 !important;
          }
          @media print {
            html, body {
              width: 2.25in !important;
              height: 4in !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            .print-btn, .print-instructions {
              display: none !important;
            }
            .label {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 2.25in !important;
              height: 4in !important;
              margin: 0 !important;
              padding: 0.1in !important;
              border: none !important;
              box-shadow: none !important;
            }
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 2.25in;
            height: 4in;
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .label {
            width: 2.25in;
            height: 4in;
            padding: 0.1in;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            background: white;
          }
          .package-ref {
            font-weight: bold;
            font-size: 11pt;
            text-align: center;
            width: 100%;
            padding-bottom: 0.05in;
            margin-bottom: 0.05in;
            border-bottom: 1px solid #000;
          }
          .po-number {
            font-size: 9pt;
            font-weight: bold;
            text-align: center;
            width: 100%;
            margin-bottom: 0.05in;
            letter-spacing: 0.5px;
          }
          .item-title {
            font-size: 9pt;
            font-weight: bold;
            text-align: center;
            line-height: 1.2;
            margin-bottom: 0.08in;
            max-height: 0.5in;
            overflow: hidden;
            width: 100%;
          }
          .qr-code {
            width: 1.3in;
            height: 1.3in;
            margin: 0.05in 0;
          }
          .item-id {
            font-family: 'Courier New', monospace;
            font-size: 7pt;
            color: #333;
            text-align: center;
            margin-top: 0.05in;
          }
          .qty-badge {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 0.08in 0.2in;
            font-size: 14pt;
            font-weight: bold;
            margin-top: 0.1in;
          }
          .print-btn {
            position: fixed;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 16px;
            font-size: 14px;
            cursor: pointer;
            z-index: 1000;
          }
          .print-instructions {
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: #fffbe6;
            border: 1px solid #faad14;
            padding: 10px 15px;
            border-radius: 4px;
            font-size: 12px;
            max-width: 300px;
            z-index: 1000;
          }
          @media screen {
            body {
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background: #f0f0f0;
              padding: 60px 20px;
            }
            .label {
              border: 1px dashed #999;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
          }
        </style>
      </head>
      <body>
        <div class="print-instructions">
          <strong>Printer Settings:</strong><br>
          1. Select AIMO D520 printer<br>
          2. Paper size: <strong>2.25 x 4 in</strong><br>
          3. Scale: <strong>100%</strong> (not "Fit to page")<br>
          4. Margins: <strong>None</strong>
        </div>
        <div class="label">
          <div class="item-title">${item.description}</div>
          ${poNumberHtml}
          <img class="qr-code" src="${qrCodeUrl}" alt="QR Code" />
          <div class="qty-badge">QTY: ${item.quantity}</div>
        </div>
        <button class="print-btn" onclick="window.print(); return false;">Print Label</button>
      </body>
      </html>
    `);

    printWindow.document.close();
  }

  /**
   * Prints QR codes for all items in the package
   * Optimized for AIMO D520 Thermal Label Printer with 2.25" x 4" labels (57mm x 102mm)
   */
  printAllItemQrCodes(): void {
    const pkg = this.package;
    if (!pkg || !pkg.items || pkg.items.length === 0) return;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    // Generate HTML for all items - each item on its own label page
    const poNumberHtml = pkg.po_number ? `<div class="po-number">PO: ${pkg.po_number}</div>` : '';
    const itemsHtml = pkg.items.map((item) => {
      const qrData = this.getItemQrData(item);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;

      return `
        <div class="label">
          <div class="item-title">${item.description}</div>
          ${poNumberHtml}
          <img class="qr-code" src="${qrCodeUrl}" alt="QR Code" />
          <div class="qty-badge">QTY: ${item.quantity}</div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Print All QR Codes - ${pkg.reference}</title>
        <style>
          /*
           * AIMO D520 Thermal Label Printer
           * Label: 2.25" x 4" (57mm x 102mm)
           */
          @page {
            size: 2.25in 4in;
            margin: 0 !important;
            padding: 0 !important;
          }
          @media print {
            html, body {
              width: 2.25in !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .screen-header, .print-btn, .print-instructions {
              display: none !important;
            }
            .labels-container {
              display: block !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .label {
              position: relative !important;
              width: 2.25in !important;
              height: 4in !important;
              margin: 0 !important;
              padding: 0.1in !important;
              border: none !important;
              box-shadow: none !important;
              page-break-after: always;
              page-break-inside: avoid;
            }
            .label:last-child {
              page-break-after: auto;
            }
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .label {
            width: 2.25in;
            height: 4in;
            padding: 0.1in;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            background: white;
          }
          .package-ref {
            font-weight: bold;
            font-size: 11pt;
            text-align: center;
            width: 100%;
            padding-bottom: 0.05in;
            margin-bottom: 0.05in;
            border-bottom: 1px solid #000;
          }
          .po-number {
            font-size: 9pt;
            font-weight: bold;
            text-align: center;
            width: 100%;
            margin-bottom: 0.05in;
            letter-spacing: 0.5px;
          }
          .item-title {
            font-size: 9pt;
            font-weight: bold;
            text-align: center;
            line-height: 1.2;
            margin-bottom: 0.08in;
            max-height: 0.5in;
            overflow: hidden;
            width: 100%;
          }
          .qr-code {
            width: 1.3in;
            height: 1.3in;
            margin: 0.05in 0;
          }
          .item-id {
            font-family: 'Courier New', monospace;
            font-size: 7pt;
            color: #333;
            text-align: center;
            margin-top: 0.05in;
          }
          .qty-badge {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 0.08in 0.2in;
            font-size: 14pt;
            font-weight: bold;
            margin-top: 0.1in;
          }
          .screen-header {
            text-align: center;
            padding: 20px;
            border-bottom: 2px solid #333;
            margin-bottom: 20px;
            background: #f5f5f5;
          }
          .screen-header h1 {
            margin: 0 0 10px 0;
            font-size: 20px;
          }
          .screen-header p {
            margin: 5px 0;
            font-size: 12px;
            color: #666;
          }
          .print-instructions {
            background: #fffbe6;
            border: 1px solid #faad14;
            padding: 15px;
            border-radius: 4px;
            margin: 10px auto;
            max-width: 400px;
            font-size: 13px;
          }
          .print-instructions strong {
            display: block;
            margin-bottom: 8px;
          }
          .print-instructions ol {
            margin-left: 20px;
          }
          .print-instructions li {
            margin: 5px 0;
          }
          .labels-container {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            justify-content: center;
            padding: 20px;
          }
          .print-btn {
            display: block;
            margin: 20px auto;
            padding: 12px 24px;
            font-size: 16px;
            cursor: pointer;
            background: #1890ff;
            color: white;
            border: none;
            border-radius: 4px;
          }
          .print-btn:hover {
            background: #40a9ff;
          }
          @media screen {
            .label {
              border: 1px dashed #999;
              margin: 10px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
          }
        </style>
      </head>
      <body>
        <div class="screen-header">
          <h1>Package QR Code Labels</h1>
          <p><strong>Reference:</strong> ${pkg.reference}</p>
          <p><strong>Total Labels:</strong> ${pkg.items.length}</p>

          <div class="print-instructions">
            <strong>⚠️ Printer Settings:</strong>
            <ol>
              <li>Select <strong>AIMO D520</strong> as printer</li>
              <li>Set Paper Size to <strong>2.25 x 4 in</strong></li>
              <li>Set Scale to <strong>100%</strong> (not "Fit to page")</li>
              <li>Set Margins to <strong>None</strong></li>
            </ol>
          </div>
        </div>
        <div class="labels-container">
          ${itemsHtml}
        </div>
        <button class="print-btn" onclick="window.print(); return false;">🖨️ Print All Labels</button>
      </body>
      </html>
    `);

    printWindow.document.close();
  }
}



