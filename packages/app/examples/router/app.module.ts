/**
 * Importing npm packages
 */
import { Module, Dispatcher } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { BlogController } from './blog.controller';
import { CommandRouter } from './command-router';
import { OutputService } from './output.service';
import { StorageService } from './storage.service';
import { UserController } from './user.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  controllers: [BlogController, UserController],
  providers: [OutputService, StorageService, { token: Dispatcher, useClass: CommandRouter }],
  exports: [Dispatcher, OutputService],
})
export class AppModule {}
