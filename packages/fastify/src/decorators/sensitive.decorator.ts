/**
 * Importing npm packages
 */
import { FieldMetadata } from '@shadow-library/class-schema';
import { MaskOptions } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type SensitiveDataType = 'secret' | 'email' | 'number' | 'words';

/**
 * Declaring the constants
 */

export function Sensitive(type?: SensitiveDataType): PropertyDecorator;
export function Sensitive(maskOptions: MaskOptions): PropertyDecorator;
export function Sensitive(typeOrMaskOptions: SensitiveDataType | MaskOptions = 'secret'): PropertyDecorator {
  return (target, propertyKey) => {
    const options: Record<string, any> = { sensitive: true };
    if (typeof typeOrMaskOptions === 'string') options.type = typeOrMaskOptions;
    else options.maskOptions = typeOrMaskOptions;
    const decorator = FieldMetadata({ 'x-fastify': options });
    decorator(target, propertyKey);
  };
}
