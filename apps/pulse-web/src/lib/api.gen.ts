/** Auto-generated file — do not edit manually */

import { APIRequest, type JsonObject } from '@shadow-library/ui';

export type CreateSenderProfileBody = {
  key: string;
  displayName?: string;
  isActive?: boolean;
};

export type SenderProfileResponse = {
  key: string;
  displayName?: string;
  id: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DevErrorResponseDto = {
  code: string;
  type: string;
  message: string;
  fields?: Array<ErrorFieldDto>;
  stack?: string;
};

export type ErrorFieldDto = {
  field: string;
  msg: string;
};

export type SortOrder = 'asc' | 'desc';

export type SortByTime = 'createdAt' | 'updatedAt';

export type ListSenderProfileResponse = {
  total: number;
  limit: number;
  offset: number;
  items: Array<SenderProfileResponse>;
};

export type UpdateSenderProfileBody = {
  displayName?: string;
  isActive?: boolean;
};

export type CreateSenderEndpointBody = {
  channel: NotificationChannel;
  provider: NotificationServiceProvider;
  identifier: string;
  weight?: number;
  isActive?: boolean;
};

export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH';

export type NotificationServiceProvider = 'DEV' | 'SENDGRID' | 'TWILIO' | 'FIREBASE' | 'AWS_SES';

export type SenderEndpointResponse = {
  channel: NotificationChannel;
  provider: NotificationServiceProvider;
  identifier: string;
  id: string;
  senderProfileId: string;
  weight: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListSenderEndpointResponse = {
  total: number;
  limit: number;
  offset: number;
  items: Array<SenderEndpointResponse>;
};

export type UpdateSenderEndpointBody = {
  identifier?: string;
  weight?: number;
  isActive?: boolean;
};

export type CreateRoutingRuleBody = {
  senderProfileId: string;
  messageType?: MessageType;
  region?: string;
  service?: string;
};

export type MessageType = 'OTP' | 'TRANSACTIONAL' | 'PROMOTIONAL';

export type SenderRoutingRuleResponse = {
  senderProfileId: string;
  messageType?: MessageType;
  region?: string;
  service?: string;
  createdAt: string;
  updatedAt: string;
};

export type ListSenderRoutingRuleResponse = {
  total: number;
  limit: number;
  offset: number;
  items: Array<SenderRoutingRuleResponse>;
};

export type SenderRoutingRuleDetailResponse = {
  senderProfileId: string;
  messageType?: MessageType;
  region?: string;
  service?: string;
  createdAt: string;
  updatedAt: string;
  profile: SenderProfileResponse;
};

export type UpdateSenderRoutingRuleBody = {
  senderProfileId: string;
};

export type CreateNotificationBody = {
  templateKey: string;
  recipients: NotificationRecipients;
  payload?: JsonObject;
  locale?: string;
  service?: string;
};

export type NotificationRecipients = {
  email?: string;
  phone?: string;
  push?: string;
};

export type CreateNotificationResponse = {
  status: 'ACCEPTED' | 'PARTIAL_ACCEPTED' | 'FAILED';
  channelResults: Array<NotificationChannelResponse>;
};

export type NotificationChannelResponse = {
  channel: NotificationChannel;
  status: 'QUEUED' | 'FAILED';
  locale?: string;
  jobId?: string;
  error?: ErrorResponseDto;
};

export type ErrorResponseDto = {
  code: string;
  type: string;
  message: string;
  fields?: Array<ErrorFieldDto>;
};

export type SortByCreatedAt = 'createdAt';

export type ListNotificationMessagesResponse = {
  total: number;
  limit: number;
  offset: number;
  items: Array<NotificationMessageResponse>;
};

export type NotificationMessageResponse = {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  locale: string;
  renderedSubject?: string;
  renderedBody: string;
  payload?: Record<string, unknown>;
  templateKey: string;
  messageType: MessageType;
  createdAt: string;
};

export type CreateTemplateGroupBody = {
  templateKey: string;
  messageType: MessageType;
  description?: string;
  priority?: Priority;
  isActive?: boolean;
};

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export type TemplateGroupResponse = {
  templateKey: string;
  messageType: MessageType;
  description?: string;
  priority?: Priority;
  isActive?: boolean;
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type ListTemplateGroupResponse = {
  total: number;
  limit: number;
  offset: number;
  items: Array<TemplateGroupResponse>;
};

export type UpdateTemplateGroupBody = {
  messageType?: MessageType;
  description?: string;
  priority?: Priority;
  isActive?: boolean;
};

export type ListTemplateVariantResponse = {
  total: number;
  limit: number;
  offset: number;
  items: Array<TemplateVariantResponse>;
};

export type TemplateVariantResponse = {
  channel: NotificationChannel;
  locale: string;
  subject?: string;
  body: string;
  isActive: boolean;
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateTemplateVariantBody = {
  channel: NotificationChannel;
  locale: string;
  subject?: string;
  body: string;
  isActive: boolean;
};

export type UpdateTemplateVariantBody = {
  subject?: string;
  body?: string;
  isActive?: boolean;
};

export type DashboardStats = {
  today: NotificationStats;
  trend: NotificationStatsTrend;
};

export type NotificationStats = {
  date: string;
  overall: NotificationDeliveryStats;
  channels: NotificationChannelStats;
};

export type NotificationDeliveryStats = {
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
};

export type NotificationChannelStats = {
  email: NotificationDeliveryStats;
  sms: NotificationDeliveryStats;
  push: NotificationDeliveryStats;
};

export type NotificationStatsTrend = {
  fromDate: string;
  toDate: string;
  stats: Array<NotificationStatsWithDate>;
};

export type NotificationStatsWithDate = {
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
  date: string;
};

export type ListSenderProfilesQuery = {
  limit?: string | number | undefined;
  offset?: string | number | undefined;
  sortOrder?: string | SortOrder | undefined;
  sortBy?: string | SortByTime | undefined;
  key?: string | undefined;
  isActive?: string | boolean | undefined;
};

export type ListSenderEndpointsQuery = {
  limit?: string | number | undefined;
  offset?: string | number | undefined;
  sortOrder?: string | SortOrder | undefined;
  sortBy?: string | SortByTime | undefined;
  channel?: string | NotificationChannel | undefined;
  provider?: string | NotificationServiceProvider | undefined;
  isActive?: string | boolean | undefined;
};

export type ListSenderRoutingRulesQuery = {
  limit?: string | number | undefined;
  offset?: string | number | undefined;
  sortOrder?: string | SortOrder | undefined;
  sortBy?: string | SortByTime | undefined;
  messageType?: string | MessageType | undefined;
  region?: string | undefined;
  serviceName?: string | undefined;
};

export type ListMessagesQuery = {
  limit?: string | number | undefined;
  offset?: string | number | undefined;
  sortOrder?: string | SortOrder | undefined;
  sortBy?: string | SortByCreatedAt | undefined;
  channel?: string | NotificationChannel | undefined;
  recipient?: string | undefined;
};

export type ListTemplateGroupsQuery = {
  limit?: string | number | undefined;
  offset?: string | number | undefined;
  sortOrder?: string | SortOrder | undefined;
  sortBy?: string | SortByTime | undefined;
  key?: string | undefined;
};

export type ListTemplateVariantsQuery = {
  limit?: string | number | undefined;
  offset?: string | number | undefined;
  sortOrder?: string | SortOrder | undefined;
  sortBy?: string | SortByTime | undefined;
  channel?: string | NotificationChannel | undefined;
  locale?: string | undefined;
};

export async function listSenderProfiles(query: ListSenderProfilesQuery): Promise<ListSenderProfileResponse> {
  return APIRequest.get('/api/v1/sender-profiles').query(query).execute<ListSenderProfileResponse>();
}

export async function createSenderProfile(body: CreateSenderProfileBody): Promise<SenderProfileResponse> {
  return APIRequest.post('/api/v1/sender-profiles').body(body).execute<SenderProfileResponse>();
}

export async function getSenderProfile(profileId: string): Promise<SenderProfileResponse> {
  return APIRequest.get(`/api/v1/sender-profiles/${profileId}`).execute<SenderProfileResponse>();
}

export async function updateSenderProfile(profileId: string, body: UpdateSenderProfileBody): Promise<SenderProfileResponse> {
  return APIRequest.patch(`/api/v1/sender-profiles/${profileId}`).body(body).execute<SenderProfileResponse>();
}

export async function deleteSenderProfile(profileId: string): Promise<unknown> {
  return APIRequest.delete(`/api/v1/sender-profiles/${profileId}`).execute<unknown>();
}

export async function listSenderEndpoints(profileId: string, query: ListSenderEndpointsQuery): Promise<ListSenderEndpointResponse> {
  return APIRequest.get(`/api/v1/sender-profiles/${profileId}/endpoints`).query(query).execute<ListSenderEndpointResponse>();
}

export async function createSenderEndpoint(profileId: string, body: CreateSenderEndpointBody): Promise<SenderEndpointResponse> {
  return APIRequest.post(`/api/v1/sender-profiles/${profileId}/endpoints`).body(body).execute<SenderEndpointResponse>();
}

export async function getSenderEndpoint(profileId: string, endpointId: string): Promise<SenderEndpointResponse> {
  return APIRequest.get(`/api/v1/sender-profiles/${profileId}/endpoints/${endpointId}`).execute<SenderEndpointResponse>();
}

export async function updateSenderEndpoint(profileId: string, endpointId: string, body: UpdateSenderEndpointBody): Promise<SenderEndpointResponse> {
  return APIRequest.patch(`/api/v1/sender-profiles/${profileId}/endpoints/${endpointId}`).body(body).execute<SenderEndpointResponse>();
}

export async function deleteSenderEndpoint(profileId: string, endpointId: string): Promise<unknown> {
  return APIRequest.delete(`/api/v1/sender-profiles/${profileId}/endpoints/${endpointId}`).execute<unknown>();
}

export async function listSenderRoutingRules(query: ListSenderRoutingRulesQuery): Promise<ListSenderRoutingRuleResponse> {
  return APIRequest.get('/api/v1/sender-routing-rules').query(query).execute<ListSenderRoutingRuleResponse>();
}

export async function createSenderRoutingRule(body: CreateRoutingRuleBody): Promise<SenderRoutingRuleResponse> {
  return APIRequest.post('/api/v1/sender-routing-rules').body(body).execute<SenderRoutingRuleResponse>();
}

export async function getSenderRoutingRule(routingRuleId: string): Promise<SenderRoutingRuleDetailResponse> {
  return APIRequest.get(`/api/v1/sender-routing-rules/${routingRuleId}`).execute<SenderRoutingRuleDetailResponse>();
}

export async function updateSenderRoutingRule(routingRuleId: string, body: UpdateSenderRoutingRuleBody): Promise<SenderRoutingRuleResponse> {
  return APIRequest.patch(`/api/v1/sender-routing-rules/${routingRuleId}`).body(body).execute<SenderRoutingRuleResponse>();
}

export async function deleteSenderRoutingRule(routingRuleId: string): Promise<unknown> {
  return APIRequest.delete(`/api/v1/sender-routing-rules/${routingRuleId}`).execute<unknown>();
}

export async function createNotification(body: CreateNotificationBody): Promise<CreateNotificationResponse> {
  return APIRequest.post('/api/v1/notifications').body(body).execute<CreateNotificationResponse>();
}

export async function listMessages(query: ListMessagesQuery): Promise<ListNotificationMessagesResponse> {
  return APIRequest.get('/api/v1/notifications/messages').query(query).execute<ListNotificationMessagesResponse>();
}

export async function listTemplateGroups(query: ListTemplateGroupsQuery): Promise<ListTemplateGroupResponse> {
  return APIRequest.get('/api/v1/template-groups').query(query).execute<ListTemplateGroupResponse>();
}

export async function createTemplateGroup(body: CreateTemplateGroupBody): Promise<TemplateGroupResponse> {
  return APIRequest.post('/api/v1/template-groups').body(body).execute<TemplateGroupResponse>();
}

export async function getTemplateGroup(groupId: string): Promise<TemplateGroupResponse> {
  return APIRequest.get(`/api/v1/template-groups/${groupId}`).execute<TemplateGroupResponse>();
}

export async function updateTemplateGroup(groupId: string, body: UpdateTemplateGroupBody): Promise<TemplateGroupResponse> {
  return APIRequest.patch(`/api/v1/template-groups/${groupId}`).body(body).execute<TemplateGroupResponse>();
}

export async function listTemplateVariants(groupId: string, query: ListTemplateVariantsQuery): Promise<ListTemplateVariantResponse> {
  return APIRequest.get(`/api/v1/template-groups/${groupId}/variants`).query(query).execute<ListTemplateVariantResponse>();
}

export async function createTemplateVariant(groupId: string, body: CreateTemplateVariantBody): Promise<TemplateVariantResponse> {
  return APIRequest.post(`/api/v1/template-groups/${groupId}/variants`).body(body).execute<TemplateVariantResponse>();
}

export async function getTemplateVariant(groupId: string, variantId: string): Promise<TemplateVariantResponse> {
  return APIRequest.get(`/api/v1/template-groups/${groupId}/variants/${variantId}`).execute<TemplateVariantResponse>();
}

export async function updateTemplateVariant(groupId: string, variantId: string, body: UpdateTemplateVariantBody): Promise<TemplateVariantResponse> {
  return APIRequest.patch(`/api/v1/template-groups/${groupId}/variants/${variantId}`).body(body).execute<TemplateVariantResponse>();
}

export async function deleteTemplateVariant(groupId: string, variantId: string): Promise<unknown> {
  return APIRequest.delete(`/api/v1/template-groups/${groupId}/variants/${variantId}`).execute<unknown>();
}

export async function getStats(): Promise<DashboardStats> {
  return APIRequest.get('/api/v1/dashboard/stats').execute<DashboardStats>();
}
