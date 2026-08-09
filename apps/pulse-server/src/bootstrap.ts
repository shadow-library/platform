import { Config } from '@shadow-library/common';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'resend.api.key': string | undefined;
    'server.port': number;
    'server.host': string;
  }
}

Config.load('resend.api.key');
Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });
