/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { type SQL } from 'bun';

/**
 * Importing user defined packages
 */
import { createMigrationClient, toMigrationConnectionString } from '@shadow-library/modules/bootstrap';

const URL_STRING = 'postgresql://migrator:secret@localhost:5432/app';
const ZEROED_TIMEOUTS = { statement_timeout: '0', lock_timeout: '0', idle_in_transaction_session_timeout: '0' };

function startupParameters(client: SQL): Record<string, string | undefined> {
  const { query = '' } = client.options as { query?: string };
  const fields = query.split('\0');
  return Object.fromEntries(fields.flatMap((field, index) => (index % 2 === 0 && field ? [[field, fields[index + 1]]] : [])));
}

describe('createMigrationClient', () => {
  it('should send every database-level timeout as a zero startup parameter', () => {
    const client = createMigrationClient(URL_STRING);

    expect(startupParameters(client)).toEqual(ZEROED_TIMEOUTS);
  });

  it('should keep the migration on a single connection', () => {
    expect(createMigrationClient(URL_STRING).options.max).toBe(1);
  });
});

describe('toMigrationConnectionString', () => {
  it('should carry every zeroed timeout in the libpq options parameter', () => {
    const options = new URL(toMigrationConnectionString(URL_STRING)).searchParams.get('options');

    expect(options).toBe('-c statement_timeout=0 -c lock_timeout=0 -c idle_in_transaction_session_timeout=0');
  });

  it('should keep existing query parameters and options', () => {
    const url = new URL(toMigrationConnectionString(`${URL_STRING}?sslmode=require&options=-c%20search_path%3Dapp`));

    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('options')).toBe('-c search_path=app -c statement_timeout=0 -c lock_timeout=0 -c idle_in_transaction_session_timeout=0');
  });
});
