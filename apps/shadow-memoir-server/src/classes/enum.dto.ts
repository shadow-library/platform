/**
 * Importing npm packages
 */
import { EnumType } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const AuthProvider = EnumType.create('AuthProvider', schema.authProvider.enumValues);
export const Theme = EnumType.create('Theme', schema.theme.enumValues);
export const IntensityMode = EnumType.create('IntensityMode', schema.intensityMode.enumValues);
export const WarmthState = EnumType.create('WarmthState', schema.warmthState.enumValues);
export const DeletionState = EnumType.create('DeletionState', schema.deletionState.enumValues);
export const ExportJobStatus = EnumType.create('ExportJobStatus', schema.exportJobStatus.enumValues);
