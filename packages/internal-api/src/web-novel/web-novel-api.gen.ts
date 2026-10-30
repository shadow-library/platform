export interface paths {
  '/internal/novels/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Upsert Novel */
    put: operations['put_internal_novels_slug'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/novels/{slug}/access': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Access */
    get: operations['get_internal_novels_slug_access'];
    /** Upsert Access */
    put: operations['put_internal_novels_slug_access'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/novels/{slug}/chapters/{ordinal}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Upsert Chapter */
    put: operations['put_internal_novels_slug_chapters_ordinal'];
    post?: never;
    /** Unpublish Chapter */
    delete: operations['delete_internal_novels_slug_chapters_ordinal'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/novels/{slug}/manifest': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Manifest */
    get: operations['get_internal_novels_slug_manifest'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/novels/{slug}/wiki/{entryKey}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Upsert Entry */
    put: operations['put_internal_novels_slug_wiki_entryKey'];
    post?: never;
    /** Delete Entry */
    delete: operations['delete_internal_novels_slug_wiki_entryKey'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/novels/{slug}/wiki/manifest': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Manifest */
    get: operations['get_internal_novels_slug_wiki_manifest'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    ChapterContentRating: {
      /** @description Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none". */
      sexualContent?: components['schemas']['SexualContentRating'];
      /** @description Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none". */
      violence?: components['schemas']['ViolenceRating'];
      /** @description Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none". */
      darkContent?: components['schemas']['DarkContentRating'];
    };
    ChapterUpsertBody: {
      title: string;
      content: string;
      authorNote?: string;
      /** @description Omit when the chapter is unrated — an absent rating is stored as unrated, never as "none". It is covered by contentHash, so changing it changes the hash. */
      contentRating?: components['schemas']['ChapterContentRating'];
      contentHash: string;
      /** @description Forge-assigned monotonic revision used for optimistic concurrency. */
      revision: number;
      wordCount?: number;
      publishedAt?: string;
    };
    /** @enum {string} */
    DarkContentRating: 'none' | 'mild' | 'heavy';
    DevErrorResponseDto: {
      code: string;
      message: string;
      fields?: components['schemas']['ErrorFieldDto'][];
      stack?: string;
    };
    ErrorFieldDto: {
      field: string;
      msg: string;
    };
    ManifestItem: components['schemas']['ManifestItem1'][];
    ManifestItem1: {
      ordinal: number;
      contentHash: string;
      revision: number;
    };
    NovelAccessBody: {
      /** @enum {string} */
      visibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
      /** @description Required only when visibility is ORGANISATION. */
      organisationId?: string;
      /** @description Resolved identity subject IDs. Email addresses are not accepted. */
      subjectIds?: string[];
      revision: number;
    };
    NovelAccessResponse: {
      /** @enum {string} */
      visibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
      organisationId?: string;
      subjectIds: string[];
      revision: number;
    };
    /** @enum {string} */
    NovelGenre:
      | 'Action'
      | 'Adult'
      | 'Adventure'
      | 'Comedy'
      | 'Drama'
      | 'Ecchi'
      | 'Fantasy'
      | 'Gender Bender'
      | 'Harem'
      | 'Historical'
      | 'Horror'
      | 'Josei'
      | 'Martial Arts'
      | 'Mature'
      | 'Mecha'
      | 'Mystery'
      | 'Psychological'
      | 'Romance'
      | 'School Life'
      | 'Sci-fi'
      | 'Seinen'
      | 'Shoujo'
      | 'Shoujo Ai'
      | 'Shounen'
      | 'Shounen Ai'
      | 'Slice of Life'
      | 'Smut'
      | 'Sports'
      | 'Supernatural'
      | 'Tragedy'
      | 'Wuxia'
      | 'Xianxia'
      | 'Xuanhuan'
      | 'Yaoi'
      | 'Yuri';
    /** @enum {string} */
    NovelTag:
      | 'Male Protagonist'
      | 'Female Protagonist'
      | 'Overpowered Protagonist'
      | 'Weak to Strong'
      | 'Protagonist Strong from the Start'
      | 'Antihero Protagonist'
      | 'Evil Protagonist'
      | 'Ruthless Protagonist'
      | 'Genius Protagonist'
      | 'Calm Protagonist'
      | 'Lazy Protagonist'
      | 'Loner Protagonist'
      | 'Underestimated Protagonist'
      | 'Multiple Protagonists'
      | 'Slow Romance'
      | 'Love Triangles'
      | 'Childhood Friends'
      | 'Arranged Marriage'
      | 'Marriage of Convenience'
      | 'Enemies Become Lovers'
      | 'Fated Lovers'
      | 'Unrequited Love'
      | 'Obsessive Love'
      | 'Secret Relationship'
      | 'Office Romance'
      | 'Reverse Harem'
      | 'Polygamy'
      | 'Tsundere'
      | 'Yandere'
      | 'Cross-dressing'
      | 'Cultivation'
      | 'Sect Development'
      | 'Master-Disciple Relationship'
      | 'Dao Companion'
      | 'Alchemy'
      | 'Martial Spirits'
      | 'Immortals'
      | 'Multiple Realms'
      | 'Strength-based Social Hierarchy'
      | 'Bloodlines'
      | 'Ancient China'
      | 'Magic'
      | 'Magic Beasts'
      | 'Dragons'
      | 'Elves'
      | 'Demons'
      | 'Demon Lord'
      | 'Gods'
      | 'Vampires'
      | 'Werebeasts'
      | 'Zombies'
      | 'Ghosts'
      | 'Witches'
      | 'Necromancer'
      | 'Beastkin'
      | 'Monster Tamer'
      | 'Curses'
      | 'Artificial Intelligence'
      | 'Androids'
      | 'Aliens'
      | 'Cosmic Wars'
      | 'Apocalypse'
      | 'Post-apocalyptic'
      | 'Dystopia'
      | 'Genetic Modifications'
      | 'Virtual Reality'
      | 'Time Travel'
      | 'Game Elements'
      | 'Level System'
      | 'MMORPG'
      | 'Dungeons'
      | 'Tower Climbing'
      | 'Cheats'
      | 'Hidden Abilities'
      | 'Transported into a Game World'
      | 'Survival Game'
      | 'e-Sports'
      | 'Modern Knowledge'
      | 'Business Management'
      | 'Showbiz'
      | 'Celebrities'
      | 'Medical Knowledge'
      | 'Organized Crime'
      | 'Academy'
      | 'College/University'
      | 'Nobles'
      | 'Royalty'
      | 'Court Official'
      | 'Imperial Harem'
      | 'Kingdom Building'
      | 'Politics'
      | 'Schemes And Conspiracies'
      | 'Wars'
      | 'Military'
      | 'Medieval'
      | 'Reincarnation'
      | 'Transmigration'
      | 'Transported to Another World'
      | 'Returning from Another World'
      | 'Parallel Worlds'
      | 'Time Loop'
      | 'Time Skip'
      | 'Second Chance'
      | 'Amnesia'
      | 'Hiding True Identity'
      | 'Mistaken Identity'
      | 'Body Swap'
      | 'Possession'
      | 'Prophecies'
      | 'Revenge'
      | 'Villainess Noble Girls'
      | 'Assassins'
      | 'Mercenaries'
      | 'Knights'
      | 'Ninjas'
      | 'Samurai'
      | 'Pirates'
      | 'Hunters'
      | 'Strategic Battles'
      | 'Battle Competition'
      | 'Harsh Training'
      | 'Sword Wielder'
      | 'Firearms'
      | 'Farming'
      | 'Cooking'
      | 'Crafting'
      | 'Blacksmith'
      | 'Herbalist'
      | 'Merchants'
      | 'Healers'
      | 'Easy Going Life'
      | 'Found Family'
      | 'Survival'
      | 'Betrayal'
      | 'Past Trauma'
      | 'Death of Loved Ones'
      | 'Bullying'
      | 'Discrimination'
      | 'Slaves'
      | 'Human Experimentation'
      | 'Drugs'
      | 'Depression'
      | 'Terminal Illness';
    NovelUpsertBody: {
      /** @description Required. The publisher's own stable id — it, not the slug, identifies the novel, so a push under a new slug renames it rather than publishing a second one. */
      sourceRef: string;
      /** @description Per-project publish token, bound trust-on-first-use. Optional for wire compatibility; once a novel is bound, a push carrying a different token is refused. Defense-in-depth that hardens the guessable sourceRef — not a full guarantee against a publisher-side authorization gap. */
      publishToken?: string;
      title: string;
      /** @description The work's own author, as the reader should see them. Omit when the publisher does not know it; readers fall back to their own placeholder. */
      originalAuthor?: string;
      blurb?: string;
      coverPath?: string;
      genres?: components['schemas']['NovelGenre'][];
      tags?: components['schemas']['NovelTag'][];
      /** @description Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none". */
      sexualContent?: components['schemas']['SexualContentRating'];
      /** @description Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none". */
      violence?: components['schemas']['ViolenceRating'];
      /** @description Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none". */
      darkContent?: components['schemas']['DarkContentRating'];
      /** @enum {string} */
      status?: 'live' | 'retired';
      /**
       * @description Required access tier. It has no PUBLIC default so an omitted value cannot accidentally publish private content.
       * @enum {string}
       */
      visibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
      /** @description Forge-assigned monotonic revision used for optimistic concurrency. */
      revision: number;
    };
    PublishResultResponse: {
      /** @description The reader's own novel id, as a string because it is a 64-bit value. Diagnostics only — no publisher may depend on having persisted it. */
      id: string;
      slug: string;
      /** @enum {string} */
      outcome: 'applied';
      revision: number;
    };
    /** @enum {string} */
    SexualContentRating: 'none' | 'suggestive' | 'moderate' | 'explicit';
    /** @enum {string} */
    ViolenceRating: 'none' | 'mild' | 'graphic' | 'extreme';
    WikiEntryUpsertBody: {
      /** @enum {string} */
      type: 'character' | 'faction' | 'location' | 'item' | 'concept' | 'power_rule';
      name: string;
      /** @description Content-addressed storage reference, such as <sha256>.webp. */
      imageRef?: string;
      /** @description First reader ordinal at which imageRef may be shown; absent shows it whenever the entry is visible. Below it the entry page shows no headline and only the list thumbnail falls back to the latest visible gallery image. */
      imageVisibleFromOrdinal?: number;
      /** @description First reader ordinal at which this entry appears; 0 exposes it before reading. */
      firstVisibleOrdinal: number;
      contentHash: string;
      /** @description Forge-assigned monotonic revision used for optimistic concurrency. */
      revision: number;
      facets: components['schemas']['WikiFacetInput'][];
      images: components['schemas']['WikiImageInput'][];
    };
    WikiFacetInput: {
      facetKey: string;
      content: string;
      sortOrder: number;
      /** @description First reader ordinal at which this facet becomes visible. */
      visibleFromOrdinal: number;
    };
    WikiImageInput: {
      imageRef: string;
      caption?: string;
      sortOrder: number;
      visibleFromOrdinal: number;
    };
    WikiManifestItem: components['schemas']['WikiManifestItem1'][];
    WikiManifestItem1: {
      entryKey: string;
      revision: number;
      contentHash: string;
      /** @description The stored headline gate, absent when the headline shows whenever the entry does. */
      imageVisibleFromOrdinal?: number;
    };
    WikiPublishResultResponse: {
      slug: string;
      entryKey: string;
      /** @enum {string} */
      outcome: 'applied';
      revision: number;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  put_internal_novels_slug: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['NovelUpsertBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PublishResultResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_internal_novels_slug_access: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NovelAccessResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_internal_novels_slug_access: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['NovelAccessBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PublishResultResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_internal_novels_slug_chapters_ordinal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
        /** @description A positive chapter ordinal of at most 9 digits. */
        ordinal: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ChapterUpsertBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PublishResultResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_internal_novels_slug_chapters_ordinal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
        /** @description A positive chapter ordinal of at most 9 digits. */
        ordinal: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_internal_novels_slug_manifest: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ManifestItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_internal_novels_slug_wiki_entryKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
        /** @description Forge-assigned stable wiki entry key. */
        entryKey: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['WikiEntryUpsertBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WikiPublishResultResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_internal_novels_slug_wiki_entryKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
        /** @description Forge-assigned stable wiki entry key. */
        entryKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_internal_novels_slug_wiki_manifest: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WikiManifestItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
}
export type ChapterContentRating = components['schemas']['ChapterContentRating'];
export type ChapterUpsertBody = components['schemas']['ChapterUpsertBody'];
export type DarkContentRating = components['schemas']['DarkContentRating'];
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type ManifestItem = components['schemas']['ManifestItem'];
export type ManifestItem1 = components['schemas']['ManifestItem1'];
export type NovelAccessBody = components['schemas']['NovelAccessBody'];
export type NovelAccessResponse = components['schemas']['NovelAccessResponse'];
export type NovelGenre = components['schemas']['NovelGenre'];
export type NovelTag = components['schemas']['NovelTag'];
export type NovelUpsertBody = components['schemas']['NovelUpsertBody'];
export type PublishResultResponse = components['schemas']['PublishResultResponse'];
export type SexualContentRating = components['schemas']['SexualContentRating'];
export type ViolenceRating = components['schemas']['ViolenceRating'];
export type WikiEntryUpsertBody = components['schemas']['WikiEntryUpsertBody'];
export type WikiFacetInput = components['schemas']['WikiFacetInput'];
export type WikiImageInput = components['schemas']['WikiImageInput'];
export type WikiManifestItem = components['schemas']['WikiManifestItem'];
export type WikiManifestItem1 = components['schemas']['WikiManifestItem1'];
export type WikiPublishResultResponse = components['schemas']['WikiPublishResultResponse'];
export type GetAccessPathParams = Exclude<paths['/internal/novels/{slug}/access']['get']['parameters']['path'], undefined>;
export type InternalNovelsSlugManifestPathParams = Exclude<paths['/internal/novels/{slug}/manifest']['get']['parameters']['path'], undefined>;
export type InternalNovelsSlugWikiManifestPathParams = Exclude<paths['/internal/novels/{slug}/wiki/manifest']['get']['parameters']['path'], undefined>;
