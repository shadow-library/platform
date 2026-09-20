import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { SyncModule } from '@modules/sync';

import { DeviceController } from './device.controller';
import { DeviceRepository } from './device.repository';
import { DeviceService } from './device.service';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, SyncModule],
  controllers: [DeviceController],
  providers: [DeviceRepository, DeviceService],
  exports: [DeviceService],
})
export class DevicesModule {}
