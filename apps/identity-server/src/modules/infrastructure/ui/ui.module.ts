/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { UiController } from './ui.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  controllers: [UiController],
})
export class UiModule {}
