/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AppService } from './app.service';
import { ConfigModule } from './config';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [ConfigModule.register({ folder: './config' })],
  providers: [AppService],
})
export class AppModule {}
