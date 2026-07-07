import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ToggleSwitchComponent } from './toggle-switch.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const meta: Meta<ToggleSwitchComponent> = {
  title: 'Shared/Components/ToggleSwitch',
  component: ToggleSwitchComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, FormsModule],
    }),
  ],
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Accessible label for the toggle',
    },
    onLabel: {
      control: 'text',
      description: 'Label when toggle is on',
    },
    offLabel: {
      control: 'text',
      description: 'Label when toggle is off',
    },
    showLabel: {
      control: 'boolean',
      description: 'Whether to show the on/off label',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the toggle is disabled',
    },
    checked: {
      control: 'boolean',
      description: 'Whether the toggle is checked',
    },
    checkedChange: { action: 'checkedChange' },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A toggle switch component for binary on/off states.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<ToggleSwitchComponent>;

export const Default: Story = {
  args: {
    checked: false,
    showLabel: true,
    onLabel: 'On',
    offLabel: 'Off',
    disabled: false,
  },
};

export const On: Story = {
  args: {
    checked: true,
    showLabel: true,
    onLabel: 'On',
    offLabel: 'Off',
    disabled: false,
  },
};

export const WithoutLabel: Story = {
  args: {
    checked: false,
    showLabel: false,
    disabled: false,
  },
};

export const CustomLabels: Story = {
  args: {
    checked: true,
    showLabel: true,
    onLabel: 'Enabled',
    offLabel: 'Disabled',
    disabled: false,
  },
};

export const Disabled: Story = {
  args: {
    checked: false,
    showLabel: true,
    onLabel: 'On',
    offLabel: 'Off',
    disabled: true,
  },
};

export const DisabledOn: Story = {
  args: {
    checked: true,
    showLabel: true,
    onLabel: 'On',
    offLabel: 'Off',
    disabled: true,
  },
};

export const DarkModeToggle: Story = {
  args: {
    checked: false,
    showLabel: true,
    onLabel: 'Dark',
    offLabel: 'Light',
    label: 'Theme toggle',
    disabled: false,
  },
};

export const NotificationsToggle: Story = {
  args: {
    checked: true,
    showLabel: true,
    onLabel: 'Notifications enabled',
    offLabel: 'Notifications disabled',
    label: 'Toggle notifications',
    disabled: false,
  },
};

