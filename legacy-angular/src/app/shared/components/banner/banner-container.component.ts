import {
  Component,
  inject,
} from '@angular/core';
import { BannerComponent } from './banner.component';
import { BannerService } from './banner.service';

/**
 * Banner Container Component
 *
 * A container component that displays banners managed by the BannerService.
 * Add this component once to your app (e.g., in app.component.html).
 * Banners are displayed at the top of the page in a stacked layout.
 *
 * @example
 * ```html
 * <!-- In app.component.html -->
 * <app-banner-container></app-banner-container>
 * ```
 */
@Component({
  selector: 'app-banner-container',
  standalone: true,
  imports: [BannerComponent],
  template: `
    <div class="banner-container">
      <!-- Debug: {{ bannerService.banners().length }} banners -->
      @for (banner of bannerService.banners(); track banner.id) {
        <app-banner
          [severity]="banner.severity"
          [message]="banner.message"
          [variant]="$any(banner.variant)"
          [dismissible]="true"
          (dismissed)="bannerService.dismiss(banner.id)"
        />
      }
    </div>
  `,
  styles: [`
    .banner-container {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0;
    }
  `],
})
export class BannerContainerComponent {
  protected readonly bannerService = inject(BannerService);
}

