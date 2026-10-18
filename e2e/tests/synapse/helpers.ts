import { type APIResponse, expect } from '@playwright/test';

export async function expectError(response: APIResponse, status: number, code: string): Promise<void> {
  const text = await response.text();
  expect(response.status(), text).toBe(status);
  expect((JSON.parse(text) as { code?: string }).code, text).toBe(code);
}

export async function jsonOf<T>(response: APIResponse, status = 200): Promise<T> {
  const text = await response.text();
  expect(response.status(), text).toBe(status);
  return JSON.parse(text) as T;
}
