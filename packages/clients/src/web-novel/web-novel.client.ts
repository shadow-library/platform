import { callService, pathParam } from '../service-call';
import { type ServiceFetch, type ServiceTarget } from '../service-fetch';
import { type CallOptions, type ResponseBody, type ServiceResponse } from '../service-response';
import {
  type ChapterUpsertBody,
  type NovelAccessBody,
  type NovelAccessResponse,
  type NovelUpsertBody,
  type operations,
  type PublishResultResponse,
  type WikiEntryUpsertBody,
  type WikiPublishResultResponse,
} from './web-novel-api.gen';

/** The reader accepts exactly this `aud`, not the service name, and its `/internal/*` guard requires the publish scope end-user tokens never carry. */
export const WEB_NOVEL_PUBLISH_TARGET: ServiceTarget = { service: 'web-novel-server', resource: 'api://web-novel', scopes: ['web-novel:publish'] };

export type ChapterManifest = ResponseBody<operations['get_internal_novels_slug_manifest'], 200>;

export type WikiManifest = ResponseBody<operations['get_internal_novels_slug_wiki_manifest'], 200>;

/** A 204 is the reader's no-op answer to an unchanged push, so an upsert answers either body or nothing. */
export type UpsertResponse<T> = ServiceResponse<T | undefined>;

export class WebNovelClient {
  constructor(
    private readonly fetch: ServiceFetch,
    private readonly target: ServiceTarget = WEB_NOVEL_PUBLISH_TARGET,
  ) {}

  upsertNovel(slug: string, body: NovelUpsertBody, options: CallOptions = {}): Promise<UpsertResponse<PublishResultResponse>> {
    return callService(this.fetch, this.target, { ...options, method: 'PUT', path: `/internal/novels/${pathParam(slug)}`, body });
  }

  upsertAccess(slug: string, body: NovelAccessBody, options: CallOptions = {}): Promise<UpsertResponse<PublishResultResponse>> {
    return callService(this.fetch, this.target, { ...options, method: 'PUT', path: `/internal/novels/${pathParam(slug)}/access`, body });
  }

  getAccess(slug: string, options: CallOptions = {}): Promise<ServiceResponse<NovelAccessResponse>> {
    return callService(this.fetch, this.target, { ...options, method: 'GET', path: `/internal/novels/${pathParam(slug)}/access` });
  }

  upsertChapter(slug: string, ordinal: number, body: ChapterUpsertBody, options: CallOptions = {}): Promise<UpsertResponse<PublishResultResponse>> {
    return callService(this.fetch, this.target, { ...options, method: 'PUT', path: `/internal/novels/${pathParam(slug)}/chapters/${pathParam(ordinal)}`, body });
  }

  deleteChapter(slug: string, ordinal: number, options: CallOptions = {}): Promise<ServiceResponse<undefined>> {
    return callService(this.fetch, this.target, { ...options, method: 'DELETE', path: `/internal/novels/${pathParam(slug)}/chapters/${pathParam(ordinal)}` });
  }

  getManifest(slug: string, options: CallOptions = {}): Promise<ServiceResponse<ChapterManifest>> {
    return callService(this.fetch, this.target, { ...options, method: 'GET', path: `/internal/novels/${pathParam(slug)}/manifest` });
  }

  upsertWiki(slug: string, entryKey: string, body: WikiEntryUpsertBody, options: CallOptions = {}): Promise<UpsertResponse<WikiPublishResultResponse>> {
    return callService(this.fetch, this.target, { ...options, method: 'PUT', path: `/internal/novels/${pathParam(slug)}/wiki/${pathParam(entryKey)}`, body });
  }

  deleteWiki(slug: string, entryKey: string, options: CallOptions = {}): Promise<ServiceResponse<undefined>> {
    return callService(this.fetch, this.target, { ...options, method: 'DELETE', path: `/internal/novels/${pathParam(slug)}/wiki/${pathParam(entryKey)}` });
  }

  getWikiManifest(slug: string, options: CallOptions = {}): Promise<ServiceResponse<WikiManifest>> {
    return callService(this.fetch, this.target, { ...options, method: 'GET', path: `/internal/novels/${pathParam(slug)}/wiki/manifest` });
  }
}
