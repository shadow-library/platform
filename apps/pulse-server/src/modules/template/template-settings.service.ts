/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService, LinkedWithParent } from '@shadow-library/modules';
import { and, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { Notification, PrimaryDatabase, Template, schema } from '@modules/database';
import { AppErrorCode } from '@server/classes';

/**
 * Defining types
 */

export type LinkedTemplateChannelSetting = LinkedWithParent<Template.ChannelSetting, Template.Group>;

/**
 * Declaring the constants
 */

@Injectable()
export class TemplateSettingsService {
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async getEnabledChannels(templateKey: string): Promise<LinkedTemplateChannelSetting[]> {
    const templateGroup = await this.db.query.templateGroups.findFirst({
      where: eq(schema.templateGroups.templateKey, templateKey),
      with: { channelSettings: { where: eq(schema.templateChannelSettings.isEnabled, true) } },
    });

    if (!templateGroup) throw new ServerError(AppErrorCode.TPL_GRP_001);
    return templateGroup.channelSettings.map(setting => this.databaseService.attachParent(setting, templateGroup));
  }

  async getChannelSettings(templateGroupId: bigint, channel: Notification.Channel): Promise<Template.ChannelSetting> {
    const channelSettings = await this.db.query.templateChannelSettings.findFirst({
      where: and(eq(schema.templateChannelSettings.templateGroupId, templateGroupId), eq(schema.templateChannelSettings.channel, channel)),
    });

    if (!channelSettings) throw new ServerError(AppErrorCode.TPL_CHN_001);
    return channelSettings;
  }

  async listChannelSettings(templateGroupId: bigint): Promise<Template.ChannelSetting[]> {
    const channelSettings = await this.db.query.templateChannelSettings.findMany({ where: eq(schema.templateChannelSettings.templateGroupId, templateGroupId) });
    return channelSettings;
  }
}
