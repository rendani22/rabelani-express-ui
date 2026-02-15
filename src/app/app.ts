import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';
import { NotificationContainerComponent } from './shared/components/notification/notification-container.component';
import { BannerContainerComponent } from './shared/components/banner/banner-container.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, NotificationContainerComponent, BannerContainerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('rabelani-express-ui');
}
