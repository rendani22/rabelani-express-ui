/**
 * Public API Surface of user-card component
 */

// Component
export { UserCardComponent } from './user-card.component';

// Module (for non-standalone usage)
export { UserCardModule } from './user-card.module';

// Interfaces
export type { User, UserCardMenuOption, UserCardAction } from './user-card.interface';

// Directive
export { ClickOutsideDirective } from './directives/click-outside.directive';

// Animations
export {
  dropdownAnimation,
  fadeInAnimation,
  scaleInAnimation
} from './animations/user-card.animations';

