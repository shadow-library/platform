import { toast } from '@shadow-library/ui';

export type UploadMime = 'image/png' | 'image/jpeg' | 'image/webp';

export const ACCEPTED_MIMES: UploadMime[] = ['image/png', 'image/jpeg', 'image/webp'];
export const ACCEPT_ATTR = 'image/png,image/jpeg,image/webp';
// Keep the base64 body under the server's 12MB limit and give oversized files a clear message.
const MAX_BYTES = 8 * 1024 * 1024;

export function readImageFile(file: File | undefined, onReady: (body: { mime: UploadMime; image: string }) => void): void {
  if (!file) return;
  if (!ACCEPTED_MIMES.includes(file.type as UploadMime)) {
    toast.danger('Use a PNG, JPEG, or WebP image');
    return;
  }
  if (file.size > MAX_BYTES) {
    toast.danger('Image is too large — pick one under 8 MB');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    // `readAsDataURL` yields `data:<mime>;base64,<bytes>` — the endpoints want the bytes alone.
    const base64 = (reader.result as string).split(',')[1] ?? '';
    onReady({ mime: file.type as UploadMime, image: base64 });
  };
  reader.onerror = () => toast.danger('Could not read that image');
  reader.readAsDataURL(file);
}
