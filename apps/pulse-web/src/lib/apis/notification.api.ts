import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from './transport';

import { type CreateNotificationBody, type CreateNotificationResponse, type ListMessagesQueryParams, type ListNotificationMessagesResponse } from './api-types.gen';

const notificationKeys = {
  messages: ['notification-messages'],
  messageLists: () => [...notificationKeys.messages, 'list'],
  messageList: (params?: ListMessagesQueryParams) => [...notificationKeys.messageLists(), params],
} as const;

export function useListNotificationMessagesQuery(params: ListMessagesQueryParams = {}): UseQueryResult<ListNotificationMessagesResponse, ApiError> {
  return useQuery<ListNotificationMessagesResponse, ApiError>({
    queryKey: notificationKeys.messageList(params),
    queryFn: () => APIRequest.get('/notifications/messages').query(params).execute(),
  });
}

export function useCreateNotificationMutation(): UseMutationResult<CreateNotificationResponse, ApiError, CreateNotificationBody> {
  const queryClient = useQueryClient();
  return useMutation<CreateNotificationResponse, ApiError, CreateNotificationBody>({
    mutationFn: data => APIRequest.post('/notifications').body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.messageLists() }),
  });
}
