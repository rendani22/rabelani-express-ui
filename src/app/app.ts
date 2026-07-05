import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';
import { NotificationContainerComponent } from './shared/components/notification/notification-container.component';
import { BannerContainerComponent } from './shared/components/banner/banner-container.component';
import { GlobalSearchComponent } from './shared/components/global-search/global-search.component';
import { ConfirmDialogHostComponent } from './shared/components/confirm-dialog/confirm-dialog-host.component';
import { OnboardingTourComponent } from './shared/components/onboarding-tour';
import { OpsLoggerService } from './core/livecode-ops'; // TEMP(livecode-ops verify)

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, NotificationContainerComponent, BannerContainerComponent, GlobalSearchComponent, ConfirmDialogHostComponent, OnboardingTourComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('rabelani-express-ui');

  // TEMP(livecode-ops verify): manual trigger to confirm errors reach the ops
  // ingest endpoint. Remove once verified.
  private readonly ops = inject(OpsLoggerService);
  protected throwOpsTestError(): void {
    // Force a near-immediate flush so the batched POST is observable, then
    // throw so the error travels the real uncaught -> ErrorHandler path.
    setTimeout(() => void this.ops.flush(), 500);
    throw new Error('livecode-OPS verification test error @ ' + this.title());
  }
}
