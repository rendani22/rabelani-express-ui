import { trigger, transition, style, animate, AnimationTriggerMetadata } from '@angular/animations';

/**
 * Dropdown animation for user card menu
 */
export const dropdownAnimation: AnimationTriggerMetadata = trigger('dropdownAnimation', [
  transition(':enter', [
    style({
      opacity: 0,
      transform: 'translateY(-0.5rem)'
    }),
    animate('150ms ease-out', style({
      opacity: 1,
      transform: 'translateY(0)'
    }))
  ]),
  transition(':leave', [
    animate('100ms ease-in', style({
      opacity: 0,
      transform: 'translateY(-0.5rem)'
    }))
  ])
]);

/**
 * Fade in animation
 */
export const fadeInAnimation: AnimationTriggerMetadata = trigger('fadeIn', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('200ms ease-out', style({ opacity: 1 }))
  ])
]);

/**
 * Scale in animation
 */
export const scaleInAnimation: AnimationTriggerMetadata = trigger('scaleIn', [
  transition(':enter', [
    style({
      opacity: 0,
      transform: 'scale(0.95)'
    }),
    animate('200ms ease-out', style({
      opacity: 1,
      transform: 'scale(1)'
    }))
  ])
]);

