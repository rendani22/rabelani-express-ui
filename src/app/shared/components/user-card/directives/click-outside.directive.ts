import { Directive, ElementRef, EventEmitter, Output, HostListener } from '@angular/core';

/**
 * Directive to detect clicks outside of an element
 *
 * @example
 * <div (clickOutside)="closeMenu()">
 *   <!-- content -->
 * </div>
 */
@Directive({
  selector: '[clickOutside]',
  standalone: true
})
export class ClickOutsideDirective {
  @Output() clickOutside = new EventEmitter<void>();

  constructor(private elementRef: ElementRef) {}

  @HostListener('document:click', ['$event.target'])
  public onClick(target: EventTarget | null): void {
    if (!target) return;
    const clickedInside = this.elementRef.nativeElement.contains(target);
    if (!clickedInside) {
      this.clickOutside.emit();
    }
  }
}

