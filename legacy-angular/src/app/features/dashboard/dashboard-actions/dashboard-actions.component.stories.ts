import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { DashboardActionsComponent } from './dashboard-actions.component';
import { CommonModule } from '@angular/common';

const meta: Meta<DashboardActionsComponent> = {
  title: 'Features/Dashboard/DashboardActions',
  component: DashboardActionsComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule],
    }),
  ],
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: 'The title displayed in the header',
    },
    filterOptions: {
      control: 'object',
      description: 'Array of filter options with label and checked state',
    },
    addViewClick: { action: 'addViewClick' },
    filterApply: { action: 'filterApply' },
    dateChange: { action: 'dateChange' },
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Dashboard actions component with filter dropdown, date picker, and add view button.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<DashboardActionsComponent>;

export const Default: Story = {
  args: {
    title: 'Dashboard',
    filterOptions: [
      { label: 'Direct VS Indirect', checked: true },
      { label: 'Real Time Value', checked: true },
      { label: 'Top Channels', checked: true },
      { label: 'Sales VS Refunds', checked: false },
      { label: 'Last Order', checked: false },
      { label: 'Total Spent', checked: false },
    ],
  },
};

export const CustomTitle: Story = {
  args: {
    title: 'Analytics Overview',
    filterOptions: [
      { label: 'Direct VS Indirect', checked: true },
      { label: 'Real Time Value', checked: true },
      { label: 'Top Channels', checked: true },
      { label: 'Sales VS Refunds', checked: false },
      { label: 'Last Order', checked: false },
      { label: 'Total Spent', checked: false },
    ],
  },
};

export const AllFiltersSelected: Story = {
  args: {
    title: 'Dashboard',
    filterOptions: [
      { label: 'Direct VS Indirect', checked: true },
      { label: 'Real Time Value', checked: true },
      { label: 'Top Channels', checked: true },
      { label: 'Sales VS Refunds', checked: true },
      { label: 'Last Order', checked: true },
      { label: 'Total Spent', checked: true },
    ],
  },
};

export const NoFiltersSelected: Story = {
  args: {
    title: 'Dashboard',
    filterOptions: [
      { label: 'Direct VS Indirect', checked: false },
      { label: 'Real Time Value', checked: false },
      { label: 'Top Channels', checked: false },
      { label: 'Sales VS Refunds', checked: false },
      { label: 'Last Order', checked: false },
      { label: 'Total Spent', checked: false },
    ],
  },
};

export const CustomFilters: Story = {
  args: {
    title: 'Sales Report',
    filterOptions: [
      { label: 'Revenue', checked: true },
      { label: 'Orders', checked: true },
      { label: 'Customers', checked: false },
      { label: 'Products', checked: false },
    ],
  },
};


