import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { RadioComponent } from './radio.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const meta: Meta<RadioComponent> = {
  title: 'Shared/Components/Radio',
  component: RadioComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, FormsModule],
    }),
  ],
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Label text for the radio button',
    },
    name: {
      control: 'text',
      description: 'Name attribute for grouping radio buttons',
    },
    radioValue: {
      control: 'text',
      description: 'Value of the radio button',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the radio button is disabled',
    },
    checked: {
      control: 'boolean',
      description: 'Whether the radio button is checked',
    },
    radioChange: { action: 'radioChange' },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A customizable radio button component.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<RadioComponent>;

export const Default: Story = {
  args: {
    label: 'Option 1',
    name: 'radio-group',
    radioValue: 'option1',
    checked: false,
    disabled: false,
  },
};

export const Checked: Story = {
  args: {
    label: 'Selected Option',
    name: 'radio-group',
    radioValue: 'selected',
    checked: true,
    disabled: false,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Option',
    name: 'radio-group',
    radioValue: 'disabled',
    checked: false,
    disabled: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    label: 'Disabled Selected',
    name: 'radio-group',
    radioValue: 'disabled-selected',
    checked: true,
    disabled: true,
  },
};

export const NoLabel: Story = {
  args: {
    name: 'radio-group',
    radioValue: 'no-label',
    checked: false,
    disabled: false,
  },
};

