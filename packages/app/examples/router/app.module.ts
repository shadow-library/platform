import { Dispatcher, Module } from '@shadow-library/app';

import { BlogController } from './blog.controller';
import { CommandRouter } from './command-router';
import { OutputService } from './output.service';
import { StorageService } from './storage.service';
import { UserController } from './user.controller';

@Module({
  controllers: [BlogController, UserController],
  providers: [OutputService, StorageService, { token: Dispatcher, useClass: CommandRouter }],
  exports: [Dispatcher, OutputService],
})
export class AppModule {}
