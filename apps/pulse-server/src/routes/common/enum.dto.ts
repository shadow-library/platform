/**
 * Importing npm packages
 */
import { EnumType } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { schema } from '@modules/datastore';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const NotificationChannel = EnumType.create('NotificationChannel', schema.notificationChannel.enumValues);
export const NotificationStatus = EnumType.create('NotificationStatus', schema.notificationStatus.enumValues);
export const Priority = EnumType.create('Priority', schema.priority.enumValues);
export const NotificationServiceProvider = EnumType.create('NotificationServiceProvider', schema.notificationServiceProviders.enumValues);
export const MessageType = EnumType.create('MessageType', schema.messageTypes.enumValues);

export const SortByCreatedAt = EnumType.create('SortByCreatedAt', ['createdAt']);
export const SortByTime = EnumType.create('SortByTime', ['createdAt', 'updatedAt']);
