import { type CatalogIssueResponse } from '@/lib/apis/api-types.gen';

import { type Notice } from './notice.types';

export interface IssueNotice extends Notice {
  issues?: CatalogIssueResponse[];
}
