import { type UserInfo, userInfoQueryOptions } from '@shadow-library/web';
import { createAuthApi } from '@shadow-library/web/auth';

import { apiClient } from './transport';

export type { AuthPrincipal as SessionResponse } from '@shadow-library/web/auth';

const authApi = createAuthApi(apiClient.auth);

export const { organisationsQueryOptions, sessionQueryOptions, switchOrganisation, logout, loginUrl } = authApi;

export const sessionKeys = authApi.keys;

export const meQuery = userInfoQueryOptions(() => apiClient.auth.get('/userinfo').execute<UserInfo>());
