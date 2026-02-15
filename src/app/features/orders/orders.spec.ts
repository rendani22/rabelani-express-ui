import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrdersComponent } from './orders';
import { PackageService } from '../../core';
import { signal } from '@angular/core';
import { vi } from 'vitest';

describe('OrdersComponent', () => {
  let component: OrdersComponent;
  let fixture: ComponentFixture<OrdersComponent>;
  let packageServiceMock: { loadPackages: any; packages: any; isLoading: any; error: any };

  beforeEach(async () => {
    packageServiceMock = {
      loadPackages: vi.fn(),
      packages: signal([]),
      isLoading: signal(false),
      error: signal(null)
    };

    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [
        { provide: PackageService, useValue: packageServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load packages on init', async () => {
    packageServiceMock.loadPackages.mockResolvedValue({ success: true, data: [] });
    await component.ngOnInit();
    expect(packageServiceMock.loadPackages).toHaveBeenCalled();
  });

  it('should open create package modal when onAddPackage is called', () => {
    expect(component.createPackageModalOpen).toBe(false);
    component.onAddPackage();
    expect(component.createPackageModalOpen).toBe(true);
  });

  it('should close modal when onCloseCreatePackageModal is called', () => {
    component.createPackageModalOpen = true;
    component.onCloseCreatePackageModal();
    expect(component.createPackageModalOpen).toBe(false);
  });
});

