import { Directive, ElementRef, EventEmitter, Input, Output, HostListener } from '@angular/core';

/**
 * Directive to detect clicks outside of an element.
 *
 * Set `clickOutsideEnabled` to `false` to make the directive ignore document
 * clicks. This is useful when the underlying UI (e.g. a dropdown) is closed
 * and we want to skip work AND avoid spurious emissions in zoneless apps.
 *
 * @example
 * <div (clickOutside)="closeMenu()" [clickOutsideEnabled]="isMenuOpen()">
 *   <!-- content -->
 * </div>
 */
@Directive({
  selector: '[clickOutside]',
  standalone: true
})
export class ClickOutsideDirective {
  @Input() clickOutsideEnabled = true;
  @Output() clickOutside = new EventEmitter<void>();

  constructor(private elementRef: ElementRef) {}

  @HostListener('document:click', ['$event.target'])
  public onClick(target: EventTarget | null): void {
    if (!this.clickOutsideEnabled || !target) return;
    const clickedInside = this.elementRef.nativeElement.contains(target);
    if (!clickedInside) {
      this.clickOutside.emit();
    }
  }
}
