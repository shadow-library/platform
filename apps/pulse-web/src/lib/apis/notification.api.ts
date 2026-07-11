/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages/modules
 */
import { APIRequest, ApiError } from './api-request';
import { type CreateNotificationBody, type CreateNotificationResponse, type ListMessagesQueryParams, type ListNotificationMessagesResponse } from './api-types.gen';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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
