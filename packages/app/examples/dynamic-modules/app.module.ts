import { Module } from '@shadow-library/app';

import { AppService } from './app.service';
import { ConfigModule } from './config';

@Module({
  imports: [ConfigModule.register({ folder: './config' })],
  providers: [AppService],
})
export class AppModule {}
