/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Copy text to the clipboard, resolving to whether it succeeded — drive a "Copied" affordance off the
 * result. Reads `navigator.clipboard` lazily, so importing this module is safe on the server; only call
 * it from a client event handler.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Trigger a browser download of a text blob (recovery codes, exported config, …). Client-only by nature —
 * call it from an event handler, never during render or on the server.
 */
export function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
