import { EnumType } from '@shadow-library/class-schema';

import { schema } from '@server/database';

/** Columns stay `char(3)` rather than a pgEnum, so a row written before a code left this list still reads back. */
export const CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'NOK', 'SEK', 'DKK', 'CHF', 'JPY', 'INR', 'AED', 'AUD', 'CAD', 'NZD', 'SGD', 'HKD', 'PLN', 'CZK', 'ZAR', 'BRL'] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const AuthProvider = EnumType.create('AuthProvider', schema.authProvider.enumValues);
export const Theme = EnumType.create('Theme', schema.theme.enumValues);
export const IntensityMode = EnumType.create('IntensityMode', schema.intensityMode.enumValues);
export const WarmthState = EnumType.create('WarmthState', schema.warmthState.enumValues);
export const DeletionState = EnumType.create('DeletionState', schema.deletionState.enumValues);
export const ExportJobStatus = EnumType.create('ExportJobStatus', schema.exportJobStatus.enumValues);
export const CurrencyCode = EnumType.create('CurrencyCode', [...CURRENCY_CODES]);
