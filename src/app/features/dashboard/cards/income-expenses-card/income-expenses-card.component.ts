import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IncomeExpenseItem } from '../../../../core/models/models';

@Component({
  selector: 'app-income-expenses-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './income-expenses-card.component.html',
  styleUrls: ['./income-expenses-card.component.css']
})
export class IncomeExpensesCardComponent {
  @Input() title = 'Income/Expenses';

  @Input() items: IncomeExpenseItem[] = [
    {
      id: '1',
      type: 'expense',
      title: 'Qonto',
      description: 'billing',
      amount: '-$49.88',
      isPositive: false
    },
    {
      id: '2',
      type: 'income',
      title: 'Cruip.com',
      description: 'Market Ltd 70 Wilson St London',
      amount: '+249.88',
      isPositive: true
    },
    {
      id: '3',
      type: 'income',
      title: 'Notion Labs Inc',
      description: '',
      amount: '+99.99',
      isPositive: true
    },
    {
      id: '4',
      type: 'income',
      title: 'Market Cap Ltd',
      description: '',
      amount: '+1,200.88',
      isPositive: true
    },
    {
      id: '5',
      type: 'blocked',
      title: 'App.com',
      description: 'Market Ltd 70 Wilson St London',
      amount: '+$99.99',
      isPositive: false
    },
    {
      id: '6',
      type: 'expense',
      title: 'App.com',
      description: 'Market Ltd 70 Wilson St London',
      amount: '-$49.88',
      isPositive: false
    }
  ];

  getIconBgClass(type: string): string {
    switch (type) {
      case 'income':
        return 'bg-green-500';
      case 'expense':
        return 'cg902';
      case 'blocked':
        return 'cvwbh';
      default:
        return 'cg902';
    }
  }

  getIconPath(type: string): string {
    switch (type) {
      case 'income':
        return 'M18.3 11.3l-1.4 1.4 4.3 4.3H11v2h10.2l-4.3 4.3 1.4 1.4L25 18z';
      case 'expense':
        return 'M17.7 24.7l1.4-1.4-4.3-4.3H25v-2H14.8l4.3-4.3-1.4-1.4L11 18z';
      case 'blocked':
        return 'M21.477 22.89l-8.368-8.367a6 6 0 008.367 8.367zm1.414-1.413a6 6 0 00-8.367-8.367l8.367 8.367zM18 26a8 8 0 110-16 8 8 0 010 16z';
      default:
        return '';
    }
  }

  getIconFillClass(type: string): string {
    return type === 'blocked' ? 'cdqku' : 'cpcyu';
  }
}

