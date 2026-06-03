import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { BulkPodDownloadsComponent } from './bulk-pod-downloads';
import { PackageService, PACKAGE_STATUS, Package } from '../../core';
import { PodExportService } from './services/pod-export.service';
import { FileSaveService } from '../../shared/services/file-save.service';
import { ToastService } from '../../shared/components/toast/toast.service';

const makePackage = (id: string, status: string): Package =>
  ({
    id,
    reference: `REF-${id}`,
    status,
    picked_up_by: status === PACKAGE_STATUS.COLLECTED ? 'driver-1' : null,
    items: [],
  }) as unknown as Package;

describe('BulkPodDownloadsComponent', () => {
  let component: BulkPodDownloadsComponent;
  let fixture: ComponentFixture<BulkPodDownloadsComponent>;

  const packagesSignal = signal<Package[]>([
    makePackage('1', PACKAGE_STATUS.COLLECTED),
    makePackage('2', PACKAGE_STATUS.COLLECTED),
    makePackage('3', PACKAGE_STATUS.DELIVERED),
    makePackage('4', PACKAGE_STATUS.PENDING),
  ]);

  const packageServiceMock = {
    packages: packagesSignal,
    isLoading: signal(false),
    loadPackages: vi.fn().mockResolvedValue(undefined),
  };

  const mockJob = {
    progress: signal(0),
    status: signal<string>('idle'),
    promise: Promise.resolve({ success: true, blob: new Blob(['pdf'], { type: 'application/pdf' }) }),
  };

  const podExportServiceMock = {
    createExportJob: vi.fn().mockReturnValue('job-1'),
    getJob: vi.fn().mockReturnValue(mockJob),
  };

  const fileSaveServiceMock = {
    saveBlob: vi.fn().mockResolvedValue(undefined),
  };

  const toastServiceMock = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    packagesSignal.set([
      makePackage('1', PACKAGE_STATUS.COLLECTED),
      makePackage('2', PACKAGE_STATUS.COLLECTED),
      makePackage('3', PACKAGE_STATUS.DELIVERED),
      makePackage('4', PACKAGE_STATUS.PENDING),
    ]);

    await TestBed.configureTestingModule({
      imports: [BulkPodDownloadsComponent],
      providers: [
        { provide: PackageService, useValue: packageServiceMock },
        { provide: PodExportService, useValue: podExportServiceMock },
        { provide: FileSaveService, useValue: fileSaveServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    })
      .overrideComponent(BulkPodDownloadsComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(BulkPodDownloadsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load packages on construction', () => {
    expect(packageServiceMock.loadPackages).toHaveBeenCalled();
  });

  it('should count total deliveries from packages signal', () => {
    expect(component.totalDeliveries()).toBe(4);
  });

  it('should count PODs uploaded (COLLECTED status)', () => {
    expect(component.podsUploadedCount()).toBe(2);
  });

  it('should count missing PODs (non-COLLECTED status)', () => {
    expect(component.missingPodsCount()).toBe(2);
  });

  it('should count unique active drivers', () => {
    expect(component.activeDriversCount()).toBe(1);
  });

  it('should select and deselect individual packages', () => {
    component.toggleSelect('1', true);
    expect(component.isSelected('1')).toBe(true);
    expect(component.selectedCount()).toBe(1);

    component.toggleSelect('1', false);
    expect(component.isSelected('1')).toBe(false);
    expect(component.selectedCount()).toBe(0);
  });

  it('should toggle selection when called without a checked argument', () => {
    component.toggleSelect('2');
    expect(component.isSelected('2')).toBe(true);
    component.toggleSelect('2');
    expect(component.isSelected('2')).toBe(false);
  });

  it('should clear all selections', () => {
    component.toggleSelect('1', true);
    component.toggleSelect('2', true);
    component.clearSelection();
    expect(component.selectedCount()).toBe(0);
    expect(component.isSelected('1')).toBe(false);
  });

  it('should handle select all via checkbox event', () => {
    const event = { target: { checked: true } } as unknown as Event;
    component.onSelectAll(event);
    // packagesSlice returns up to pageSize packages
    expect(component.selectedCount()).toBeGreaterThan(0);
  });

  it('should deselect all via select-all unchecked event', () => {
    component.toggleSelect('1', true);
    const event = { target: { checked: false } } as unknown as Event;
    component.onSelectAll(event);
    expect(component.selectedCount()).toBe(0);
  });

  it('should handle row checkbox change', () => {
    const event = { target: { checked: true } } as unknown as Event;
    component.onRowCheckboxChange(event, 'pkg-1');
    expect(component.isSelected('pkg-1')).toBe(true);
  });

  it('should show info toast and skip export when no packages are selected', async () => {
    await component.downloadSelected();
    expect(toastServiceMock.info).toHaveBeenCalledWith('No PODs selected');
    expect(podExportServiceMock.createExportJob).not.toHaveBeenCalled();
  });

  it('should start an export job and save blob when packages are selected', async () => {
    component.toggleSelect('1', true);
    await component.downloadSelected();
    expect(podExportServiceMock.createExportJob).toHaveBeenCalledWith(['1'], { merge: false });
    expect(fileSaveServiceMock.saveBlob).toHaveBeenCalled();
    expect(toastServiceMock.success).toHaveBeenCalled();
  });

  it('should start a merge export job', async () => {
    component.toggleSelect('1', true);
    await component.mergeSelected();
    expect(podExportServiceMock.createExportJob).toHaveBeenCalledWith(['1'], { merge: true });
  });

  it('should show error toast when export job is not found', async () => {
    podExportServiceMock.getJob.mockReturnValueOnce(null);
    component.toggleSelect('1', true);
    await component.downloadSelected();
    expect(toastServiceMock.error).toHaveBeenCalledWith('Failed to start export job');
  });

  it('should show error toast when export result is unsuccessful', async () => {
    const failJob = {
      ...mockJob,
      promise: Promise.resolve({ success: false, error: 'Export failed' }),
    };
    podExportServiceMock.getJob.mockReturnValueOnce(failJob);
    component.toggleSelect('1', true);
    await component.downloadSelected();
    expect(toastServiceMock.error).toHaveBeenCalledWith('Export failed');
  });

  it('should paginate packages using packagesSlice', () => {
    component.pageSize = 2;
    const slice = component.packagesSlice();
    expect(slice.length).toBeLessThanOrEqual(2);
  });

  it('should load more packages on loadMore', () => {
    const before = component.currentPage();
    component.loadMore();
    expect(component.currentPage()).toBe(before + 1);
  });

  it('should apply quick date range "today"', async () => {
    await component.applyQuickRange('today');
    expect(packageServiceMock.loadPackages).toHaveBeenCalled();
  });

  it('should apply quick date range "yesterday"', async () => {
    await component.applyQuickRange('yesterday');
    expect(packageServiceMock.loadPackages).toHaveBeenCalled();
  });

  it('should apply quick date range "thisWeek"', async () => {
    await component.applyQuickRange('thisWeek');
    expect(packageServiceMock.loadPackages).toHaveBeenCalled();
  });

  it('should apply quick date range "lastWeek"', async () => {
    await component.applyQuickRange('lastWeek');
    expect(packageServiceMock.loadPackages).toHaveBeenCalled();
  });

  it('should track packages by id', () => {
    const pkg = makePackage('x', PACKAGE_STATUS.PENDING);
    expect(component.trackByPackage(0, pkg)).toBe('x');
  });
});
