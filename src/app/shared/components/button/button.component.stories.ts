import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ButtonComponent } from './button.component';
import { CommonModule } from '@angular/common';

const meta: Meta<ButtonComponent> = {
  title: 'Shared/Components/Button',
  component: ButtonComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule],
    }),
  ],
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger'],
      description: 'Visual style of the button',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size preset',
    },
    type: {
      control: 'select',
      options: ['button', 'submit', 'reset'],
      description: 'Native button type',
    },
    disabled: { control: 'boolean', description: 'Disable the button' },
    loading: { control: 'boolean', description: 'Show spinner and block interaction' },
    fullWidth: { control: 'boolean', description: 'Stretch to fill the container width' },
    iconOnly: { control: 'boolean', description: 'Square icon-only button (≥40x40 hit area)' },
    ariaLabel: { control: 'text', description: 'Accessible label (required for icon-only)' },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The shared button primitive with scale-on-press feedback, concentric radius, and a focus-visible ring. Prefer it over hand-rolled `<button>` markup.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<ButtonComponent>;

export const Primary: Story = {
  args: { variant: 'primary', size: 'md' },
  render: (args) => ({
    props: args,
    template: `<app-button [variant]="variant" [size]="size" [disabled]="disabled" [loading]="loading">Save changes</app-button>`,
  }),
};

export const Secondary: Story = {
  args: { variant: 'secondary', size: 'md' },
  render: (args) => ({
    props: args,
    template: `<app-button [variant]="variant" [size]="size" [disabled]="disabled" [loading]="loading">Cancel</app-button>`,
  }),
};

export const Ghost: Story = {
  args: { variant: 'ghost', size: 'md' },
  render: (args) => ({
    props: args,
    template: `<app-button [variant]="variant" [size]="size" [disabled]="disabled" [loading]="loading">Learn more</app-button>`,
  }),
};

export const Danger: Story = {
  args: { variant: 'danger', size: 'md' },
  render: (args) => ({
    props: args,
    template: `<app-button [variant]="variant" [size]="size" [disabled]="disabled" [loading]="loading">Delete package</app-button>`,
  }),
};

export const Loading: Story = {
  args: { variant: 'primary', size: 'md', loading: true },
  render: (args) => ({
    props: args,
    template: `<app-button [variant]="variant" [size]="size" [loading]="loading">Saving…</app-button>`,
  }),
};

export const Sizes: Story = {
  render: () => ({
    template: `
      <div class="flex items-center gap-3">
        <app-button variant="primary" size="sm">Small</app-button>
        <app-button variant="primary" size="md">Medium</app-button>
        <app-button variant="primary" size="lg">Large</app-button>
      </div>
    `,
  }),
};

export const IconOnly: Story = {
  args: { variant: 'ghost', iconOnly: true, ariaLabel: 'Close' },
  render: (args) => ({
    props: args,
    template: `
      <app-button [variant]="variant" [iconOnly]="iconOnly" [ariaLabel]="ariaLabel">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z"/>
        </svg>
      </app-button>
    `,
  }),
};

export const FullWidth: Story = {
  args: { variant: 'primary', fullWidth: true },
  render: (args) => ({
    props: args,
    template: `<div style="width: 320px"><app-button [variant]="variant" [fullWidth]="fullWidth">Continue</app-button></div>`,
  }),
};
