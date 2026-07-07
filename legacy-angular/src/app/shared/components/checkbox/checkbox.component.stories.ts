import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { CheckboxComponent } from './checkbox.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const meta: Meta<CheckboxComponent> = {
  title: 'Shared/Components/Checkbox',
  component: CheckboxComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, FormsModule],
    }),
  ],
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Label text for the checkbox',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the checkbox is disabled',
    },
    checked: {
      control: 'boolean',
      description: 'Whether the checkbox is checked',
    },
    checkedChange: { action: 'checkedChange' },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A customizable checkbox component with label support.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<CheckboxComponent>;

export const Default: Story = {
  args: {
    label: 'Accept terms and conditions',
    checked: false,
    disabled: false,
  },
};

export const Checked: Story = {
  args: {
    label: 'Remember me',
    checked: true,
    disabled: false,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled option',
    checked: false,
    disabled: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    label: 'Disabled and checked',
    checked: true,
    disabled: true,
  },
};

export const NoLabel: Story = {
  args: {
    checked: false,
    disabled: false,
  },
};

export const LongLabel: Story = {
  args: {
    label: 'I agree to receive marketing emails and promotional content from the company',
    checked: false,
    disabled: false,
  },
};

