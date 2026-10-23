import { toast } from '@shadow-library/ui';

export function reportToast(target: string): void {
  toast.info(`Reported ${target}. Thanks — our team will take a look.`);
}
