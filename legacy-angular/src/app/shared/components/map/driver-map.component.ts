import {
  Component,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  ChangeDetectionStrategy,
  input,
  output,
  effect,
  signal,
  ChangeDetectorRef,
  inject,
  NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { DriverMapMarker, DriverStatus } from '../../../core';

// Fix for default marker icons in Leaflet with webpack/Angular
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/**
 * DriverMapComponent displays drivers on an interactive map.
 *
 * Features:
 * - Display driver locations with custom markers
 * - Color-coded markers based on driver status
 * - Click to select a driver
 * - Auto-center on markers
 */
@Component({
  selector: 'app-driver-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative w-full h-full min-h-[400px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <div #mapContainer class="w-full h-full" style="min-height: 400px;"></div>

      <!-- Legend -->
      <div class="absolute bottom-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 z-[1000]">
        <div class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Driver Status</div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-green-500"></span>
            <span class="text-xs text-gray-600 dark:text-gray-400">Available</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-blue-500"></span>
            <span class="text-xs text-gray-600 dark:text-gray-400">On Delivery</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-gray-400"></span>
            <span class="text-xs text-gray-600 dark:text-gray-400">Offline</span>
          </div>
        </div>
      </div>

      <!-- No drivers message -->
      @if (markers().length === 0 && mapReady()) {
        <div class="absolute inset-0 flex items-center justify-center bg-gray-100/80 dark:bg-gray-900/80 z-[1000]">
          <div class="text-center">
            <svg class="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <p class="text-gray-500 dark:text-gray-400 text-sm">No driver locations available</p>
            <p class="text-gray-400 dark:text-gray-500 text-xs mt-1">Drivers will appear when they share their location</p>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 400px;
    }

    :host ::ng-deep .leaflet-container {
      width: 100% !important;
      height: 100% !important;
      min-height: 400px;
      z-index: 1;
      background: #e5e7eb;
    }

    :host ::ng-deep .leaflet-tile-container img {
      width: 256px;
      height: 256px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DriverMapComponent implements AfterViewInit, OnDestroy {
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  /** Array of driver markers to display */
  readonly markers = input<DriverMapMarker[]>([]);

  /** ID of the currently selected driver */
  readonly selectedDriverId = input<string | null>(null);

  /** Emitted when a driver marker is clicked */
  readonly driverSelect = output<string>();

  /** Signal to track if map is ready */
  readonly mapReady = signal(false);

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup | null = null;
  private markerMap = new Map<string, L.Marker>();

  // Default center (South Africa - Johannesburg)
  private readonly defaultCenter: L.LatLngExpression = [-26.2041, 28.0473];
  private readonly defaultZoom = 10;

  constructor() {
    // React to marker changes - only after map is ready
    effect(() => {
      const currentMarkers = this.markers();
      if (this.map && this.mapReady()) {
        this.ngZone.runOutsideAngular(() => {
          this.updateMarkers(currentMarkers);
        });
      }
    });

    // React to selection changes
    effect(() => {
      const selectedId = this.selectedDriverId();
      if (this.mapReady()) {
        this.highlightSelectedMarker(selectedId);
      }
    });
  }

  ngAfterViewInit(): void {
    // Initialize map outside Angular zone for better performance
    this.ngZone.runOutsideAngular(() => {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        setTimeout(() => {
          this.initializeMap();
          this.ngZone.run(() => {
            this.mapReady.set(true);
            this.cdr.markForCheck();
          });
        }, 50);
      });
    });
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private resizeObserver: ResizeObserver | null = null;

  private initializeMap(): void {
    if (!this.mapContainer?.nativeElement) {
      console.error('Map container not found');
      return;
    }

    const container = this.mapContainer.nativeElement;

    try {
      // Initialize the map
      this.map = L.map(container, {
        center: this.defaultCenter,
        zoom: this.defaultZoom,
        zoomControl: true,
        attributionControl: true
      });

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(this.map);

      // Initialize markers layer
      this.markersLayer = L.layerGroup().addTo(this.map);

      // Force multiple resize checks to ensure tiles load properly
      const map = this.map;
      setTimeout(() => map?.invalidateSize(), 100);
      setTimeout(() => map?.invalidateSize(), 300);
      setTimeout(() => map?.invalidateSize(), 500);

      // Set up ResizeObserver to handle container size changes
      this.resizeObserver = new ResizeObserver(() => {
        setTimeout(() => {
          map?.invalidateSize();
        }, 100);
      });
      this.resizeObserver.observe(container);

      // Add initial markers
      this.updateMarkers(this.markers());
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  private updateMarkers(markers: DriverMapMarker[]): void {
    if (!this.map || !this.markersLayer) return;

    // Clear existing markers
    this.markersLayer.clearLayers();
    this.markerMap.clear();

    // Add new markers
    markers.forEach(marker => {
      const leafletMarker = this.createMarker(marker);
      this.markerMap.set(marker.driverId, leafletMarker);
      this.markersLayer!.addLayer(leafletMarker);
    });

    // Fit bounds to show all markers
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.latitude, m.longitude]));
      this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }

  private createMarker(marker: DriverMapMarker): L.Marker {
    const icon = this.createCustomIcon(marker.status, marker.driverId === this.selectedDriverId());

    const leafletMarker = L.marker([marker.latitude, marker.longitude], { icon })
      .bindPopup(this.createPopupContent(marker))
      .on('click', () => {
        this.driverSelect.emit(marker.driverId);
      });

    return leafletMarker;
  }

  private createCustomIcon(status: DriverStatus, isSelected: boolean): L.DivIcon {
    const colors: Record<DriverStatus, string> = {
      available: 'bg-green-500',
      on_delivery: 'bg-blue-500',
      offline: 'bg-gray-400'
    };

    const borderColor = isSelected ? 'ring-2 ring-violet-500 ring-offset-2' : '';
    const size = isSelected ? 'w-8 h-8' : 'w-6 h-6';

    return L.divIcon({
      className: 'custom-driver-marker',
      html: `
        <div class="relative">
          <div class="${size} ${colors[status]} ${borderColor} rounded-full shadow-lg flex items-center justify-center transition-all duration-200">
            <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 ${colors[status]} rotate-45"></div>
        </div>
      `,
      iconSize: [32, 40],
      iconAnchor: [16, 40],
      popupAnchor: [0, -40]
    });
  }

  private createPopupContent(marker: DriverMapMarker): string {
    const statusLabels: Record<DriverStatus, string> = {
      available: 'Available',
      on_delivery: 'On Delivery',
      offline: 'Offline'
    };

    const statusColors: Record<DriverStatus, string> = {
      available: 'text-green-600',
      on_delivery: 'text-blue-600',
      offline: 'text-gray-500'
    };

    const lastUpdated = new Date(marker.lastUpdated).toLocaleTimeString();

    return `
      <div class="p-2 min-w-[150px]">
        <div class="font-semibold text-gray-900">${marker.driverName}</div>
        <div class="text-sm ${statusColors[marker.status]} mt-1">${statusLabels[marker.status]}</div>
        <div class="text-xs text-gray-500 mt-1">Last updated: ${lastUpdated}</div>
        ${marker.activePackages > 0 ? `<div class="text-xs text-gray-600 mt-1">${marker.activePackages} active package(s)</div>` : ''}
      </div>
    `;
  }

  private highlightSelectedMarker(selectedId: string | null): void {
    this.markerMap.forEach((marker, driverId) => {
      const markerData = this.markers().find(m => m.driverId === driverId);
      if (markerData) {
        const icon = this.createCustomIcon(markerData.status, driverId === selectedId);
        marker.setIcon(icon);
      }
    });
  }

  /**
   * Center map on a specific driver
   */
  centerOnDriver(driverId: string): void {
    const marker = this.markerMap.get(driverId);
    if (marker && this.map) {
      this.map.setView(marker.getLatLng(), 15);
      marker.openPopup();
    }
  }

  /**
   * Reset map view to show all markers
   */
  resetView(): void {
    if (!this.map) return;

    const currentMarkers = this.markers();
    if (currentMarkers.length > 0) {
      const bounds = L.latLngBounds(currentMarkers.map(m => [m.latitude, m.longitude]));
      this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else {
      this.map.setView(this.defaultCenter, this.defaultZoom);
    }
  }

  /**
   * Force refresh the map tiles and size
   */
  refreshMap(): void {
    if (this.map) {
      this.map.invalidateSize();
      // Small pan to trigger tile reload
      const center = this.map.getCenter();
      this.map.panTo([center.lat + 0.0001, center.lng], { animate: false });
      this.map.panTo(center, { animate: false });
    }
  }
}

