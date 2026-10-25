import { type CatalogChange } from '@/features/catalog/catalog-changes';
import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { readProviders } from '@/features/catalog/catalog-readers';

export type CredentialNamer = (id: string) => string | undefined;

const STORED_KEY = 'a stored key';

export function credentialNamer(credentials: readonly { id: string; name: string }[] | undefined): CredentialNamer | null {
  if (!credentials) return null;
  const names = new Map(credentials.map(credential => [credential.id, credential.name]));
  return id => names.get(id);
}

function credentialOf(document: CatalogDocument | null, provider: string): string | undefined {
  return document ? readProviders(document).find(entry => entry.key === provider)?.credential : undefined;
}

/** Credential ids are opaque to `describeChanges`; names need the credentials permission, so without it the line reads "a stored key". */
export function nameCredentialChanges(changes: readonly CatalogChange[], before: CatalogDocument | null, after: CatalogDocument, nameOf: CredentialNamer | null): CatalogChange[] {
  return changes.map(change => {
    if (change.area !== 'provider' || change.field !== 'credential') return change;
    const lead = `${change.entityLabel} — API key`;
    const oldId = credentialOf(before, change.entityKey);
    const newId = credentialOf(after, change.entityKey);
    const oldName = oldId ? nameOf?.(oldId) : undefined;
    const newName = newId ? nameOf?.(newId) : undefined;
    const quoted = (name: string | undefined, fallback: string): string => (name ? `“${name}”` : fallback);
    if (!oldId && newId) return { ...change, sentence: `${lead} set to ${quoted(newName, STORED_KEY)}` };
    if (oldId && !newId) return { ...change, sentence: oldName ? `${lead} “${oldName}” removed` : `${lead} removed` };
    if (oldName && newName) return { ...change, before: oldName, after: newName, sentence: `${lead}: ${oldName} → ${newName}` };
    return { ...change, sentence: `${lead} replaced with ${quoted(newName, 'another stored key')}` };
  });
}
