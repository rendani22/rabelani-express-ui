import { signal, computed } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { InventoryComponent } from './inventory';
import { InventoryService, InventoryItem, InventoryStats } from '../../core';
import { ToastService } from '../../shared/components/toast';

const now = new Date().toISOString();
const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days ago

const mockItem: InventoryItem = {
  id: 'item-1',
  name: 'Box A',
  sku: 'SKU-001',
  description: 'A sturdy box',
  category: 'Packaging',
  unit: 'pieces',
  quantity: 20,
  low_stock_threshold: 10,
  unit_price: 5.00,
  is_active: true,
  created_at: now,
  updated_at: now,
};

const lowStockItem: InventoryItem = {
  ...mockItem,
  id: 'item-2',
  name: 'Tape',
  sku: 'SKU-002',
  quantity: 5,
  low_stock_threshold: 10,
};

const outOfStockItem: InventoryItem = {
  ...mockItem,
  id: 'item-3',
  name: 'Bubble Wrap',
  sku: 'SKU-003',
  quantity: 0,
};

const inactiveItem: InventoryItem = {
  ...mockItem,
  id: 'item-4',
  name: 'Old Pallet',
  is_active: false,
};

const mockStats: InventoryStats = {
  totalItems: 3,
  activeItems: 3,
  totalStock: 25,
  lowStockCount: 1,
  outOfStockCount: 1,
  staleStockCount: 0,
  totalValue: 125,
  categories: ['Packaging'],
};

describe('InventoryComponent', () => {
  let component: InventoryComponent;
  let fixture: ComponentFixture<InventoryComponent>;

  const itemsSignal = signal<InventoryItem[]>([mockItem, lowStockItem, outOfStockItem, inactiveItem]);

  const inventoryServiceMock = {
    items: itemsSignal,
    loading: signal(false),
    error: signal<string | null>(null),
    stats: signal<InventoryStats>(mockStats),
    loadItems: vi.fn().mockResolvedValue(undefined),
    createItem: vi.fn().mockResolvedValue({ success: true, data: mockItem }),
    updateItem: vi.fn().mockResolvedValue({ success: true, data: mockItem }),
    deleteItem: vi.fn().mockResolvedValue({ success: true }),
    toggleActive: vi.fn().mockResolvedValue({ success: true, data: { ...mockItem, is_active: false } }),
  };

  const toastServiceMock = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    itemsSignal.set([mockItem, lowStockItem, outOfStockItem, inactiveItem]);

    await TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        { provide: InventoryService, useValue: inventoryServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    })
      .overrideComponent(InventoryComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(InventoryComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load items on init', () => {
    component.ngOnInit();
    expect(inventoryServiceMock.loadItems).toHaveBeenCalled();
  });

  it('should show only active items by default', () => {
    // inactiveItem should be filtered out
    const filtered = component.filteredItems();
    expect(filtered.every(i => i.is_active)).toBe(true);
    expect(filtered).toHaveLength(3);
  });

  it('should show inactive items when showInactive is toggled', () => {
    component.onToggleShowInactive();
    expect(component.filteredItems()).toHaveLength(4);
  });

  it('should filter by search query', () => {
    component.onSearchChange({ target: { value: 'tape' } } as unknown as Event);
    expect(component.filteredItems()).toHaveLength(1);
    expect(component.filteredItems()[0].name).toBe('Tape');
  });

  it('should filter by category', () => {
    component.onCategoryChange({ target: { value: 'Packaging' } } as unknown as Event);
    expect(component.filteredItems().every(i => i.category === 'Packaging')).toBe(true);
  });

  it('should filter to low stock items only', () => {
    component.onToggleLowStock();
    const filtered = component.filteredItems();
    expect(filtered.every(i => i.quantity > 0 && i.quantity <= i.low_stock_threshold)).toBe(true);
  });

  it('should filter to out-of-stock items only', () => {
    component.onToggleOutOfStock();
    const filtered = component.filteredItems();
    expect(filtered.every(i => i.quantity === 0)).toBe(true);
  });

  it('should mutually exclude low-stock when out-of-stock is toggled', () => {
    component.onToggleLowStock();
    expect(component.filterLowStock()).toBe(true);
    component.onToggleOutOfStock();
    expect(component.filterLowStock()).toBe(false);
    expect(component.filterOutOfStock()).toBe(true);
  });

  it('should mutually exclude out-of-stock when low-stock is toggled', () => {
    component.onToggleOutOfStock();
    expect(component.filterOutOfStock()).toBe(true);
    component.onToggleLowStock();
    expect(component.filterOutOfStock()).toBe(false);
    expect(component.filterLowStock()).toBe(true);
  });

  it('should open and close add form', () => {
    component.onShowAddForm();
    expect(component.showAddForm()).toBe(true);

    component.onCancelAdd();
    expect(component.showAddForm()).toBe(false);
  });

  it('should not submit add form when invalid', async () => {
    component.onShowAddForm();
    await component.onSubmitAdd();
    expect(inventoryServiceMock.createItem).not.toHaveBeenCalled();
  });

  it('should create item with valid form and show toast', async () => {
    component.onShowAddForm();
    component.addForm.patchValue({ name: 'New Item', unit: 'pieces', quantity: 10, low_stock_threshold: 5 });

    await component.onSubmitAdd();
    expect(inventoryServiceMock.createItem).toHaveBeenCalled();
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('Box A'));
    expect(component.showAddForm()).toBe(false);
  });

  it('should show error toast when create fails', async () => {
    inventoryServiceMock.createItem.mockResolvedValueOnce({ success: false, error: 'DB error' });
    component.onShowAddForm();
    component.addForm.patchValue({ name: 'Fail', unit: 'pieces', quantity: 10, low_stock_threshold: 5 });

    await component.onSubmitAdd();
    expect(toastServiceMock.error).toHaveBeenCalledWith('DB error');
  });

  it('should populate edit form when starting edit', () => {
    component.onStartEdit(mockItem);
    expect(component.editingId()).toBe('item-1');
    expect(component.editForm.value.name).toBe('Box A');
    expect(component.showAddForm()).toBe(false);
  });

  it('should cancel edit and clear editing id', () => {
    component.onStartEdit(mockItem);
    component.onCancelEdit();
    expect(component.editingId()).toBeNull();
  });

  it('should update item with valid edit form', async () => {
    component.onStartEdit(mockItem);
    component.editForm.patchValue({ name: 'Box A Updated' });

    await component.onSubmitEdit(mockItem);
    expect(inventoryServiceMock.updateItem).toHaveBeenCalledWith('item-1', expect.any(Object));
    expect(toastServiceMock.success).toHaveBeenCalled();
  });

  it('should open and confirm delete', async () => {
    component.onDeleteRequest(mockItem);
    expect(component.confirmDeleteOpen()).toBe(true);
    expect(component.itemPendingDelete()).toBe(mockItem);

    await component.onConfirmDelete();
    expect(inventoryServiceMock.deleteItem).toHaveBeenCalledWith('item-1');
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('"Box A"'));
    expect(component.confirmDeleteOpen()).toBe(false);
  });

  it('should cancel delete', () => {
    component.onDeleteRequest(mockItem);
    component.onCancelDelete();
    expect(component.confirmDeleteOpen()).toBe(false);
    expect(component.itemPendingDelete()).toBeNull();
    expect(inventoryServiceMock.deleteItem).not.toHaveBeenCalled();
  });

  it('should toggle active and show toast', async () => {
    await component.onToggleActive(mockItem);
    expect(inventoryServiceMock.toggleActive).toHaveBeenCalledWith(mockItem);
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('"Box A"'));
  });

  it('should open and close movement history panel', () => {
    component.onOpenHistory(mockItem);
    expect(component.historyPanelOpen()).toBe(true);
    expect(component.historyPanelItem()).toBe(mockItem);

    component.onCloseHistory();
    expect(component.historyPanelOpen()).toBe(false);
    expect(component.historyPanelItem()).toBeNull();
  });

  it('should open and close restock modal', () => {
    component.onOpenRestock(mockItem);
    expect(component.restockOpen()).toBe(true);
    expect(component.restockItem()).toBe(mockItem);

    component.onCloseRestock();
    expect(component.restockOpen()).toBe(false);
    expect(component.restockItem()).toBeNull();
  });

  it('should refresh by calling loadItems', async () => {
    await component.onRefresh();
    expect(inventoryServiceMock.loadItems).toHaveBeenCalled();
  });

  it('should compute categories from stats', () => {
    expect(component.categories()).toEqual(['Packaging']);
  });

  it('should paginate items based on page size', () => {
    component.pageSize.set(2);
    expect(component.pagedItems().length).toBeLessThanOrEqual(2);
  });

  it('should compute total pages', () => {
    component.pageSize.set(2);
    expect(component.totalPages()).toBe(2); // 3 active items / 2 per page
  });

  it('should dismiss banners', () => {
    component.outOfStockBannerDismissed.set(true);
    expect(component.outOfStockBannerDismissed()).toBe(true);

    component.lowStockBannerDismissed.set(true);
    expect(component.lowStockBannerDismissed()).toBe(true);
  });
});
