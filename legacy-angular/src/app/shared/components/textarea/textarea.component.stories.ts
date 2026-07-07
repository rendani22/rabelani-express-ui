import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { TextareaComponent } from './textarea.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const meta: Meta<TextareaComponent> = {
  title: 'Shared/Components/Textarea',
  component: TextareaComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, FormsModule],
    }),
  ],
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Label for the textarea',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    rows: {
      control: 'number',
      description: 'Number of visible rows',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the textarea is disabled',
    },
    required: {
      control: 'boolean',
      description: 'Whether the textarea is required',
    },
    supportingText: {
      control: 'text',
      description: 'Supporting text below the textarea',
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
        component: 'A customizable textarea component.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<TextareaComponent>;

export const Default: Story = {
  args: {
    label: 'Description',
    placeholder: 'Enter a description...',
    rows: 4,
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Your Message',
    placeholder: 'Type your message here...',
    rows: 5,
  },
};

export const Required: Story = {
  args: {
    label: 'Comments',
    placeholder: 'Enter your comments...',
    required: true,
    rows: 4,
  },
};

export const WithSupportingText: Story = {
  args: {
    label: 'Bio',
    placeholder: 'Tell us about yourself...',
    supportingText: 'Maximum 500 characters',
    rows: 4,
  },
};

export const WithError: Story = {
  args: {
    label: 'Description',
    placeholder: 'Enter description...',
    error: true,
    errorText: 'Description is required',
    rows: 4,
  },
};

export const WithSuccess: Story = {
  args: {
    label: 'Description',
    placeholder: 'Enter description...',
    success: true,
    successText: 'Description saved successfully',
    rows: 4,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Textarea',
    placeholder: 'Cannot edit',
    disabled: true,
    rows: 4,
  },
};

export const SmallRows: Story = {
  args: {
    label: 'Short Input',
    placeholder: 'A short text area',
    rows: 2,
  },
};

export const LargeRows: Story = {
  args: {
    label: 'Long Input',
    placeholder: 'A larger text area for longer content',
    rows: 8,
  },
};

