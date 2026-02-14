import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface PlanOption {
  id: string;
  name: string;
  price: string;
  period: string;
  features: string;
  badge?: string;
  isCurrentPlan?: boolean;
}

@Component({
  selector: 'app-plan-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './plan-modal.component.html',
})
export class PlanModalComponent {
  @Input() isOpen = false;
  @Input() title = 'Change your Plan';
  @Input() plans: PlanOption[] = [];
  @Input() confirmText = 'Change Plan';
  @Input() cancelText = 'Cancel';
  @Input() renewalNote = '';
  @Output() closeModal = new EventEmitter<void>();
  @Output() planChange = new EventEmitter<PlanOption>();

  selectedPlanId: string | null = null;

  onClose(): void {
    this.closeModal.emit();
  }

  selectPlan(plan: PlanOption): void {
    this.selectedPlanId = plan.id;
  }

  onConfirm(): void {
    const selectedPlan = this.plans.find((p) => p.id === this.selectedPlanId);
    if (selectedPlan) {
      this.planChange.emit(selectedPlan);
    }
  }

  isSelected(plan: PlanOption): boolean {
    return this.selectedPlanId === plan.id || (this.selectedPlanId === null && plan.isCurrentPlan === true);
  }
}

