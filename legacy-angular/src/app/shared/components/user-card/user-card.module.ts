import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { UserCardComponent } from './user-card.component';
import { ClickOutsideDirective } from './directives/click-outside.directive';

/**
 * UserCardModule
 *
 * Module version for projects not using standalone components.
 * For Angular 14+ projects, prefer importing the standalone component directly.
 *
 * @example
 * import { UserCardModule } from './user-card/user-card.module';
 *
 * @NgModule({
 *   imports: [UserCardModule]
 * })
 * export class MyModule { }
 */
@NgModule({
  imports: [
    CommonModule,
    UserCardComponent,
    ClickOutsideDirective
  ],
  exports: [
    UserCardComponent,
    ClickOutsideDirective
  ]
})
export class UserCardModule { }

