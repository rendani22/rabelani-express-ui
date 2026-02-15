import type { Meta, StoryObj } from '@storybook/angular';
import { QrCodeComponent } from './qr-code.component';

const meta: Meta<QrCodeComponent> = {
  title: 'Shared/QR Code',
  component: QrCodeComponent,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A reusable QR code component for generating and displaying QR codes. Supports customization of size, colors, error correction level, and includes an optional download button.',
      },
    },
  },
  argTypes: {
    data: {
      control: 'text',
      description: 'The data to encode in the QR code (URL, text, etc.)',
    },
    size: {
      control: { type: 'range', min: 100, max: 400, step: 50 },
      description: 'Size of the QR code in pixels',
    },
    errorCorrectionLevel: {
      control: { type: 'select' },
      options: ['L', 'M', 'Q', 'H'],
      description: 'Error correction level: L (7%), M (15%), Q (25%), H (30%)',
    },
    margin: {
      control: { type: 'number', min: 0, max: 10 },
      description: 'Margin around the QR code (in modules)',
    },
    colorDark: {
      control: 'color',
      description: 'Color of the dark modules',
    },
    colorLight: {
      control: 'color',
      description: 'Color of the light modules',
    },
    elementType: {
      control: { type: 'select' },
      options: ['canvas', 'svg', 'img'],
      description: 'Element type for rendering',
    },
    label: {
      control: 'text',
      description: 'Optional label to display below the QR code',
    },
    showDownloadButton: {
      control: 'boolean',
      description: 'Whether to show the download button',
    },
    downloadButtonText: {
      control: 'text',
      description: 'Text for the download button',
    },
  },
};

export default meta;
type Story = StoryObj<QrCodeComponent>;

export const Default: Story = {
  args: {
    data: 'https://example.com',
    size: 200,
    errorCorrectionLevel: 'M',
    margin: 4,
    colorDark: '#000000',
    colorLight: '#ffffff',
    elementType: 'canvas',
  },
};

export const WithLabel: Story = {
  args: {
    data: 'https://example.com/package/12345',
    size: 200,
    label: 'Scan to view package details',
    errorCorrectionLevel: 'M',
  },
};

export const WithDownloadButton: Story = {
  args: {
    data: 'PKG-2024-001-ABCD',
    size: 200,
    label: 'Package Reference',
    showDownloadButton: true,
    downloadButtonText: 'Download QR Code',
    errorCorrectionLevel: 'M',
  },
};

export const SmallSize: Story = {
  args: {
    data: 'https://example.com',
    size: 100,
    errorCorrectionLevel: 'L',
  },
};

export const LargeSize: Story = {
  args: {
    data: 'https://example.com',
    size: 300,
    errorCorrectionLevel: 'H',
  },
};

export const CustomColors: Story = {
  args: {
    data: 'https://example.com',
    size: 200,
    colorDark: '#7c3aed',
    colorLight: '#f5f3ff',
    label: 'Branded QR Code',
    errorCorrectionLevel: 'M',
  },
};

export const JsonData: Story = {
  args: {
    data: JSON.stringify({
      reference: 'PKG-2024-001',
      id: '12345',
      status: 'in_transit',
      receiver: 'john@example.com',
    }),
    size: 200,
    label: 'Package Information',
    showDownloadButton: true,
    errorCorrectionLevel: 'Q',
  },
};

export const HighErrorCorrection: Story = {
  args: {
    data: 'https://example.com/important',
    size: 200,
    errorCorrectionLevel: 'H',
    label: 'High error correction (30%)',
  },
};

