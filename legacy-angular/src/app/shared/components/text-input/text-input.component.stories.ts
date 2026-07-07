import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { TextInputComponent } from './text-input.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const meta: Meta<TextInputComponent> = {
  title: 'Shared/Components/TextInput',
  component: TextInputComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, FormsModule],
    }),
  ],
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel', 'url'],
      description: 'Input type',
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
      description: 'Size of the input',
    },
    label: {
      control: 'text',
      description: 'Label for the input',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
    required: {
      control: 'boolean',
      description: 'Whether the input is required',
    },
    prefix: {
      control: 'text',
      description: 'Prefix text to display',
    },
    suffix: {
      control: 'text',
      description: 'Suffix text to display',
    },
    supportingText: {
      control: 'text',
      description: 'Supporting text below the input',
    },
    errorText: {
      control: 'text',
      description: 'Error message to display',
    },
    successText: {
      control: 'text',
      description: 'Success message to display',
    },
    error: {
      control: 'boolean',
      description: 'Whether to show error state',
    },
    success: {
      control: 'boolean',
      description: 'Whether to show success state',
    },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A reusable text input component with various configurations.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<TextInputComponent>;

export const Default: Story = {
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
    type: 'email',
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Full Name',
    placeholder: 'John Doe',
    type: 'text',
  },
};

export const Required: Story = {
  args: {
    label: 'Password',
    placeholder: 'Enter password',
    type: 'password',
    required: true,
  },
};

export const WithPrefix: Story = {
  args: {
    label: 'Price',
    placeholder: '0.00',
    type: 'number',
    prefix: '$',
  },
};

export const WithSuffix: Story = {
  args: {
    label: 'Weight',
    placeholder: '0',
    type: 'number',
    suffix: 'kg',
  },
};

export const WithSupportingText: Story = {
  args: {
    label: 'Username',
    placeholder: 'Enter username',
    supportingText: 'This will be your public display name',
  },
};

export const WithError: Story = {
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
    type: 'email',
    error: true,
    errorText: 'Please enter a valid email address',
  },
};

export const WithSuccess: Story = {
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
    type: 'email',
    success: true,
    successText: 'Email is available',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Input',
    placeholder: 'Cannot edit',
    disabled: true,
  },
};

export const Small: Story = {
  args: {
    label: 'Small Input',
    placeholder: 'Small size',
    size: 'small',
  },
};

export const Large: Story = {
  args: {
    label: 'Large Input',
    placeholder: 'Large size',
    size: 'large',
  },
};

