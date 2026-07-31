/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { FileUpload } from './FileUpload';
import { type UploadHandle } from './FileUpload.types';

/**
 * Declaring the constants
 */
function fakeUpload(_file: File, { onProgress, signal }: UploadHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    let percent = 0;
    const timer = setInterval(() => {
      percent += 20;
      onProgress(percent);
      if (percent >= 100) {
        clearInterval(timer);
        resolve();
      }
    }, 300);
    signal.addEventListener('abort', () => {
      clearInterval(timer);
      reject(new Error('aborted'));
    });
  });
}

const meta = {
  title: 'Components/FileUpload',
  component: FileUpload,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileUpload>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Dropzone: Story = {
  args: { accept: ['.pdf', '.png', '.docx'], maxSize: 25 * 1024 * 1024, maxFiles: 5, upload: fakeUpload, 'aria-label': 'Choose files' },
};

export const ButtonVariant: Story = {
  args: { variant: 'button', accept: ['.png', '.jpg'], upload: fakeUpload, 'aria-label': 'Attach files' },
};
