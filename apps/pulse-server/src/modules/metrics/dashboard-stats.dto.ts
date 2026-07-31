/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class NotificationDeliveryStats {
  @Field()
  total: number;

  @Field()
  succeeded: number;

  @Field()
  failed: number;

  @Field()
  pending: number;
}

@Schema()
export class NotificationStatsWithDate extends NotificationDeliveryStats {
  @Field(() => String)
  @Transform({ output: 'date:dmy' })
  date: number;
}

@Schema()
export class NotificationChannelStats {
  @Field()
  email: NotificationDeliveryStats;

  @Field()
  sms: NotificationDeliveryStats;

  @Field()
  push: NotificationDeliveryStats;
}

@Schema()
export class NotificationStats {
  @Field(() => String)
  @Transform({ output: 'date:dmy' })
  date: number;

  @Field()
  overall: NotificationDeliveryStats;

  @Field()
  channels: NotificationChannelStats;
}

@Schema()
export class NotificationStatsTrend {
  @Field(() => String)
  @Transform({ output: 'date:dmy' })
  fromDate: number;

  @Field(() => String)
  @Transform({ output: 'date:dmy' })
  toDate: number;

  @Field(() => [NotificationStatsWithDate])
  stats: NotificationStatsWithDate[];
}

@Schema()
export class DashboardStats {
  @Field()
  today: NotificationStats;

  @Field()
  trend: NotificationStatsTrend;
}
