import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';
import { NotificationContainerComponent } from './shared/components/notification/notification-container.component';
import { BannerContainerComponent } from './shared/components/banner/banner-container.component';
import { GlobalSearchComponent } from './shared/components/global-search/global-search.component';
import { ConfirmDialogHostComponent } from './shared/components/confirm-dialog/confirm-dialog-host.component';
import { OnboardingTourComponent } from './shared/components/onboarding-tour';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, NotificationContainerComponent, BannerContainerComponent, GlobalSearchComponent, ConfirmDialogHostComponent, OnboardingTourComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('rabelani-express-ui');
}
