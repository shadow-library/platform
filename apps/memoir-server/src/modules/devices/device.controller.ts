import { Authenticated, RequireScope } from '@shadow-library/auth/module';
import { Body, Delete, HttpController, HttpStatus, Params, Put, RespondFor } from '@shadow-library/fastify';

import { type Device } from '@server/database';

import { DeviceIdParams, DeviceResponseDto, DeviceUpsertDto } from './device.dto';
import { DeviceService } from './device.service';

@HttpController('/api/v1/account/devices')
@Authenticated()
@RequireScope('memoir:account')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Put('/:deviceId')
  @HttpStatus(200)
  @RespondFor(200, DeviceResponseDto)
  register(@Params() params: DeviceIdParams, @Body() body: DeviceUpsertDto): Promise<Device.Row> {
    return this.deviceService.register(params.deviceId, body);
  }

  @Delete('/:deviceId')
  @HttpStatus(204)
  deregister(@Params() params: DeviceIdParams): Promise<void> {
    return this.deviceService.remove(params.deviceId);
  }
}
