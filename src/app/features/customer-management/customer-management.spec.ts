import { signal, computed } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CustomerManagementComponent } from './customer-management';
import { ReceiverService, ReceiverProfile, PACKAGE_STATUS } from '../../core';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SupabaseService } from '../../shared/services/supabase.service';

const mockReceivers: ReceiverProfile[] = [
  {
    id: 'r1',
    name: 'Alice',
    surname: 'Smith',
    email: 'alice@example.com',
    phone: '0801234567',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  } as ReceiverProfile,
  {
    id: 'r2',
    name: 'Bob',
    surname: 'Jones',
    email: 'bob@example.com',
    is_active: false,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  } as ReceiverProfile,
];

describe('CustomerManagementComponent', () => {
  let component: CustomerManagementComponent;
  let fixture: ComponentFixture<CustomerManagementComponent>;

  const receiverListSignal = signal<ReceiverProfile[]>(mockReceivers);

  const receiverServiceMock = {
    receiverList: receiverListSignal,
    loading: signal(false),
    error: signal<string | null>(null),
    loadAllReceivers: vi.fn().mockResolvedValue(undefined),
    deactivateReceiver: vi.fn().mockResolvedValue(undefined),
    reactivateReceiver: vi.fn().mockResolvedValue(undefined),
  };

  const toastServiceMock = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };

  const packagesData = [
    {
      id: 'pkg-1',
      reference: 'REF-001',
      receiver_email: 'alice@example.com',
      status: PACKAGE_STATUS.DELIVERED,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: packagesData }),
  };
  const fromChain = {
    select: vi.fn().mockReturnValue(selectChain),
  };
  const supabaseServiceMock = {
    client: {
      from: vi.fn().mockReturnValue(fromChain),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    receiverListSignal.set(mockReceivers);

    await TestBed.configureTestingModule({
      imports: [CustomerManagementComponent],
      providers: [
        { provide: ReceiverService, useValue: receiverServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: SupabaseService, useValue: supabaseServiceMock },
      ],
    })
      .overrideComponent(CustomerManagementComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(CustomerManagementComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load receivers on init', async () => {
    await component.ngOnInit();
    expect(receiverServiceMock.loadAllReceivers).toHaveBeenCalled();
  });

  it('should filter receivers by search query', () => {
    component.onSearchChange({ target: { value: 'alice' } } as unknown as Event);
    expect(component.searchQuery()).toBe('alice');
    expect(component.filteredReceivers()).toHaveLength(1);
    expect(component.filteredReceivers()[0].name).toBe('Alice');
  });

  it('should return all receivers when search is empty', () => {
    component.onSearchChange({ target: { value: '' } } as unknown as Event);
    expect(component.filteredReceivers()).toHaveLength(2);
  });

  it('should filter by email', () => {
    component.onSearchChange({ target: { value: 'bob@example.com' } } as unknown as Event);
    expect(component.filteredReceivers()).toHaveLength(1);
    expect(component.filteredReceivers()[0].name).toBe('Bob');
  });

  it('should map active receiver to User with correct fields', () => {
    const user = component.mapReceiverToUser(mockReceivers[0]);
    expect(user.id).toBe('r1');
    expect(user.name).toBe('Alice Smith');
    expect(user.country).toBe('Active');
    expect(user.countryFlag).toBe('✅');
    expect(user.bio).toContain('alice@example.com');
    expect(user.bio).toContain('0801234567');
    expect(user.avatar).toContain('ui-avatars.com');
  });

  it('should map inactive receiver to User with Inactive label', () => {
    const user = component.mapReceiverToUser(mockReceivers[1]);
    expect(user.country).toBe('Inactive');
    expect(user.countryFlag).toBe('⛔');
    expect(user.bio).toContain('Inactive');
  });

  it('should return active menu options for active receivers', () => {
    expect(component.getMenuOptions(mockReceivers[0])).toBe(component.menuOptions);
  });

  it('should return inactive menu options for inactive receivers', () => {
    expect(component.getMenuOptions(mockReceivers[1])).toBe(component.inactiveMenuOptions);
  });

  it('should look up a receiver by id within filteredReceivers', () => {
    expect(component.getReceiverById('r1')?.name).toBe('Alice');
    expect(component.getReceiverById('r2')?.name).toBe('Bob');
    expect(component.getReceiverById('missing')).toBeUndefined();
  });

  it('should open and close the add customer modal', () => {
    component.onAddCustomer();
    expect(component.addCustomerModalOpen()).toBe(true);

    component.onCloseAddCustomerModal();
    expect(component.addCustomerModalOpen()).toBe(false);
  });

  it('should open and close the edit customer modal', () => {
    component.onEditCustomer(mockReceivers[0]);
    expect(component.editCustomerModalOpen()).toBe(true);
    expect(component.editingReceiver()).toBe(mockReceivers[0]);

    component.onCloseEditCustomerModal();
    expect(component.editCustomerModalOpen()).toBe(false);
    expect(component.editingReceiver()).toBeNull();
  });

  it('should open and close the manage contacts modal', () => {
    component.onManageContacts(mockReceivers[0]);
    expect(component.manageContactsModalOpen()).toBe(true);
    expect(component.contactsReceiver()).toBe(mockReceivers[0]);

    component.onCloseManageContactsModal();
    expect(component.manageContactsModalOpen()).toBe(false);
    expect(component.contactsReceiver()).toBeNull();
  });

  it('should set pending deactivation and open confirm dialog', async () => {
    await component.onDeactivate(mockReceivers[0]);
    expect(component.confirmDeactivateOpen()).toBe(true);
    expect(component.receiverPendingDeactivation()).toBe(mockReceivers[0]);
    expect(component.deactivateReceiverMessage()).toContain('Alice Smith');
  });

  it('should confirm deactivation and show toast', async () => {
    await component.onDeactivate(mockReceivers[0]);
    await component.onConfirmDeactivate();
    expect(receiverServiceMock.deactivateReceiver).toHaveBeenCalledWith('r1');
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('Alice Smith'));
    expect(component.confirmDeactivateOpen()).toBe(false);
    expect(component.receiverPendingDeactivation()).toBeNull();
  });

  it('should cancel deactivation', async () => {
    await component.onDeactivate(mockReceivers[0]);
    component.onCancelDeactivate();
    expect(component.confirmDeactivateOpen()).toBe(false);
    expect(component.receiverPendingDeactivation()).toBeNull();
    expect(receiverServiceMock.deactivateReceiver).not.toHaveBeenCalled();
  });

  it('should call reactivateReceiver for the reactivate menu option', async () => {
    await component.onCardAction({ userId: 'r2', actionType: 'menuOption', menuOption: 'reactivate' });
    expect(receiverServiceMock.reactivateReceiver).toHaveBeenCalledWith('r2');
  });

  it('should open package history panel and load packages', async () => {
    await component.onViewPackages(mockReceivers[0]);
    expect(component.historyPanelOpen()).toBe(true);
    expect(component.selectedReceiver()).toBe(mockReceivers[0]);
    expect(component.receiverPackages()).toHaveLength(1);
  });

  it('should close the history panel and clear state', async () => {
    await component.onViewPackages(mockReceivers[0]);
    component.onCloseHistoryPanel();
    expect(component.historyPanelOpen()).toBe(false);
    expect(component.selectedReceiver()).toBeNull();
    expect(component.receiverPackages()).toHaveLength(0);
  });

  it('should send email for sendEmail card action', async () => {
    const hrefSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, set href(v: string) { hrefSpy(v); } },
    });

    await component.onCardAction({ userId: 'r1', actionType: 'sendEmail' });
    expect(hrefSpy).toHaveBeenCalledWith('mailto:alice@example.com');
  });

  it('should no-op on card action when receiver is not found', async () => {
    await component.onCardAction({ userId: 'missing', actionType: 'menuOption', menuOption: 'deactivate' });
    expect(receiverServiceMock.deactivateReceiver).not.toHaveBeenCalled();
  });

  it('should show toast on customer update', () => {
    component.onCustomerUpdated(mockReceivers[0]);
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('Alice Smith'));
  });

  it('should return correct status labels', () => {
    expect(component.getStatusLabel(PACKAGE_STATUS.DELIVERED)).toBe('Delivered');
    expect(component.getStatusLabel(PACKAGE_STATUS.IN_TRANSIT)).toBe('In Transit');
    expect(component.getStatusLabel('unknown_status')).toBe('unknown_status');
  });

  it('should return a non-empty badge class for known statuses', () => {
    expect(component.getStatusBadgeClass(PACKAGE_STATUS.PENDING)).toContain('yellow');
    expect(component.getStatusBadgeClass('unknown')).toContain('gray');
  });

  it('should format a date string', () => {
    const formatted = component.formatDate('2026-01-15T00:00:00Z');
    expect(formatted).toContain('2026');
    expect(formatted).toContain('Jan');
  });

  it('should track receivers by id', () => {
    expect(component.trackByReceiverId(0, mockReceivers[0])).toBe('r1');
  });
});
