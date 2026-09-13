function isValidIPv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isValidIPv6(value: string): boolean {
  if (value.includes('%')) return false;
  if ((value.startsWith(':') && !value.startsWith('::')) || (value.endsWith(':') && !value.endsWith('::'))) return false;

  const doubleColonCount = value.split('::').length - 1;
  if (doubleColonCount > 1) return false;

  const [headPart = '', tailPart = ''] = value.split('::');
  const head = headPart ? headPart.split(':') : [];
  const tail = doubleColonCount === 1 && tailPart ? tailPart.split(':') : [];
  let groups = [...head, ...tail];

  let ipv4Weight = 0;
  const lastGroup = groups[groups.length - 1];
  if (lastGroup?.includes('.')) {
    if (!isValidIPv4(lastGroup)) return false;
    groups = groups.slice(0, -1);
    ipv4Weight = 2;
  }

  if (groups.some(group => !/^[0-9a-fA-F]{1,4}$/.test(group))) return false;

  const total = groups.length + ipv4Weight;
  return doubleColonCount === 1 ? total < 8 : total === 8;
}

export function isValidIpAddress(value: string): boolean {
  return isValidIPv4(value) || isValidIPv6(value);
}

export function isValidCidr(value: string): boolean {
  const trimmed = value.trim();
  const slashIndex = trimmed.lastIndexOf('/');
  if (slashIndex === -1) return isValidIpAddress(trimmed);

  const address = trimmed.slice(0, slashIndex);
  const prefixText = trimmed.slice(slashIndex + 1);
  if (!/^\d{1,3}$/.test(prefixText)) return false;
  const prefix = Number(prefixText);

  if (isValidIPv4(address)) return prefix <= 32;
  if (isValidIPv6(address)) return prefix <= 128;
  return false;
}

export function validateCidr(value: string): boolean | string {
  return isValidCidr(value) || 'Must be a valid IP address or CIDR range';
}
