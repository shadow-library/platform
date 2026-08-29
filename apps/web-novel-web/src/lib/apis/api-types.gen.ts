export interface paths {
  '/api/auth/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Login */
    get: operations['get_api_auth_login'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/callback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Callback */
    get: operations['get_api_auth_callback'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Logout */
    post: operations['post_api_auth_logout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/session': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Session */
    get: operations['get_api_auth_session'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/userinfo': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Userinfo */
    get: operations['get_api_auth_userinfo'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/organisations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Organisations */
    get: operations['get_api_auth_organisations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/organisation': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Switch Organisation */
    post: operations['post_api_auth_organisation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/step-up': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Step Up */
    get: operations['get_api_auth_step_up'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Health */
    get: operations['get_health'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health/ready': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Ready */
    get: operations['get_health_ready'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
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
  '/api/novels': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Novels */
    get: operations['get_api_novels'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Novel */
    get: operations['get_api_novels_slug'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels/{slug}/chapters': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Chapters */
    get: operations['get_api_novels_slug_chapters'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels/{slug}/chapters/{ordinal}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Chapter */
    get: operations['get_api_novels_slug_chapters_ordinal'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/me/progress': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Progress */
    get: operations['get_api_me_progress'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels/{slug}/progress': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Progress */
    get: operations['get_api_novels_slug_progress'];
    /** Save Progress */
    put: operations['put_api_novels_slug_progress'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/library': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Library */
    get: operations['get_api_library'];
    put?: never;
    /** Add To Library */
    post: operations['post_api_library'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/shared': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Shared */
    get: operations['get_api_shared'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/library/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Remove From Library */
    delete: operations['delete_api_library_slug'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels/{slug}/wiki': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Entries */
    get: operations['get_api_novels_slug_wiki'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels/{slug}/wiki/{entryKey}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Entry */
    get: operations['get_api_novels_slug_wiki_entryKey'];
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
    AuthLogoutResponse: {
      success: boolean;
      redirectTo?: string;
    };
    AuthSessionResponse: {
      sub: string;
      scopes: string[];
      org?: string;
      aal?: string;
      clientId?: string;
    };
    AuthUserInfoResponse: {
      sub: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      preferred_username?: string;
      picture?: string;
      email?: string;
      email_verified?: boolean;
    };
    AuthOrganisationsResponse: {
      organisations: components['schemas']['AuthOrganisationItem'][];
    };
    AuthOrganisationItem: {
      id: string;
      slug: string;
      name: string;
      /** @enum {string} */
      type: 'PERSONAL' | 'TEAM';
      active: boolean;
    };
    SwitchOrganisationBody: {
      organisationId: string;
    };
    SwitchOrganisationResponse: {
      organisationId: string;
    };
    HealthResponse: {
      /** @enum {string} */
      status: 'ok';
    };
    ReadyResponse: {
      /** @enum {string} */
      status: 'ok' | 'degraded';
      dependencies: components['schemas']['HealthDependencies'];
    };
    HealthDependencies: {
      /** @enum {string} */
      postgres: 'up' | 'down';
    };
    NovelUpsertBody: {
      /** @description Required. The publisher's own stable id — it, not the slug, identifies the novel, so a push under a new slug renames it rather than publishing a second one. */
      sourceRef: string;
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
    /** @enum {string} */
    SexualContentRating: 'none' | 'suggestive' | 'moderate' | 'explicit';
    /** @enum {string} */
    ViolenceRating: 'none' | 'mild' | 'graphic' | 'extreme';
    /** @enum {string} */
    DarkContentRating: 'none' | 'mild' | 'heavy';
    PublishResultResponse: {
      /** @description The reader's own novel id, as a string because it is a 64-bit value. Diagnostics only — no publisher may depend on having persisted it. */
      id: string;
      slug: string;
      /** @enum {string} */
      outcome: 'applied';
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
    ChapterContentRating: {
      /** @description Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none". */
      sexualContent?: components['schemas']['SexualContentRating'];
      /** @description Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none". */
      violence?: components['schemas']['ViolenceRating'];
      /** @description Omit when unrated. An absent dimension is stored as unrated and is never inferred to be "none". */
      darkContent?: components['schemas']['DarkContentRating'];
    };
    ManifestItem: components['schemas']['ManifestItem1'][];
    ManifestItem1: {
      ordinal: number;
      contentHash: string;
      revision: number;
    };
    WikiEntryUpsertBody: {
      /** @enum {string} */
      type: 'character' | 'faction' | 'location' | 'item' | 'concept' | 'power_rule';
      name: string;
      /** @description Content-addressed storage reference, such as <sha256>.webp. */
      imageRef?: string;
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
    WikiPublishResultResponse: {
      slug: string;
      entryKey: string;
      /** @enum {string} */
      outcome: 'applied';
      revision: number;
    };
    WikiManifestItem: components['schemas']['WikiManifestItem1'][];
    WikiManifestItem1: {
      entryKey: string;
      revision: number;
      contentHash: string;
    };
    /** @enum {string} */
    SortOrder: 'asc' | 'desc';
    /** @enum {string} */
    NovelSortBy: 'updatedAt' | 'createdAt' | 'title';
    NovelCatalogResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['NovelSummary'][];
    };
    NovelSummary: {
      slug: string;
      title: string;
      /** @description The work's own author; absent when the publisher did not supply one. */
      author?: string;
      blurb?: string;
      /** @description Absolute public URL; absent when the novel has no cover. */
      coverUrl?: string;
      genres: components['schemas']['NovelGenre'][];
      tags: components['schemas']['NovelTag'][];
      /** @description Absent when unrated; never asserts the absence of content. */
      sexualContent?: components['schemas']['SexualContentRating'];
      /** @description Absent when unrated; never asserts the absence of content. */
      violence?: components['schemas']['ViolenceRating'];
      /** @description Absent when unrated; never asserts the absence of content. */
      darkContent?: components['schemas']['DarkContentRating'];
      /** @enum {string} */
      status: 'live' | 'retired';
      /**
       * @description The access tier already authorized for the caller.
       * @enum {string}
       */
      visibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
      chapterCount: number;
      updatedAt: string;
    };
    NovelDetailResponse: {
      slug: string;
      title: string;
      /** @description The work's own author; absent when the publisher did not supply one. */
      author?: string;
      blurb?: string;
      /** @description Absolute public URL; absent when the novel has no cover. */
      coverUrl?: string;
      genres: components['schemas']['NovelGenre'][];
      tags: components['schemas']['NovelTag'][];
      /** @description Absent when unrated; never asserts the absence of content. */
      sexualContent?: components['schemas']['SexualContentRating'];
      /** @description Absent when unrated; never asserts the absence of content. */
      violence?: components['schemas']['ViolenceRating'];
      /** @description Absent when unrated; never asserts the absence of content. */
      darkContent?: components['schemas']['DarkContentRating'];
      /** @enum {string} */
      status: 'live' | 'retired';
      /**
       * @description The access tier already authorized for the caller.
       * @enum {string}
       */
      visibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
      chapterCount: number;
      updatedAt: string;
      createdAt: string;
    };
    ChapterListResponse: {
      items: components['schemas']['ChapterMetaItem'][];
    };
    ChapterMetaItem: {
      ordinal: number;
      title: string;
      wordCount?: number;
      publishedAt?: string;
    };
    ChapterContentResponse: {
      novelSlug: string;
      ordinal: number;
      title: string;
      content: string;
      authorNote?: string;
      wordCount?: number;
      revision: number;
      publishedAt?: string;
    };
    ProgressListResponse: {
      items: components['schemas']['ProgressListItem'][];
    };
    ProgressListItem: {
      ordinal: number;
      position: number;
      /** @description Furthest chapter ever reached; it does not decrease when rereading earlier chapters. */
      furthestOrdinal: number;
      updatedAt: string;
      novelSlug: string;
    };
    ProgressResponse: {
      ordinal: number;
      position: number;
      /** @description Furthest chapter ever reached; it does not decrease when rereading earlier chapters. */
      furthestOrdinal: number;
      updatedAt: string;
    };
    ProgressBody: {
      ordinal: number;
      /** @description Scroll offset within the chapter as reported by the reader client. */
      position: number;
    };
    LibraryListResponse: {
      items: components['schemas']['LibraryItem'][];
    };
    LibraryItem: {
      slug: string;
      title: string;
      /** @description The work's own author; absent when the publisher did not supply one. */
      author?: string;
      /** @description Absolute public URL; absent when the novel has no cover. */
      coverUrl?: string;
      genres: components['schemas']['NovelGenre'][];
      /** @enum {string} */
      status: 'live' | 'retired';
      /**
       * @description The access tier already authorized for the caller.
       * @enum {string}
       */
      visibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
      /** @description Shelf addition time; on /shared, this is the novel's last update time. */
      addedAt: string;
    };
    LibraryAddBody: {
      slug: string;
    };
    WikiListResponse: {
      items: components['schemas']['WikiListItem'][];
      /** @description Number of entries hidden beyond the reader's progress gate; hidden entries are never returned. */
      lockedCount: number;
    };
    WikiListItem: {
      entryKey: string;
      /** @enum {string} */
      type: 'character' | 'faction' | 'location' | 'item' | 'concept' | 'power_rule';
      name: string;
      /** @description Absolute public URL; absent when the entry has no image. */
      imageUrl?: string;
    };
    WikiEntryDetailResponse: {
      entryKey: string;
      /** @enum {string} */
      type: 'character' | 'faction' | 'location' | 'item' | 'concept' | 'power_rule';
      name: string;
      imageUrl?: string;
      facets: components['schemas']['WikiFacetItem'][];
      images: components['schemas']['WikiImageItem'][];
      /** @description Number of facets hidden beyond the reader's progress gate; hidden facet content is never returned. */
      hiddenFacetCount: number;
    };
    WikiFacetItem: {
      facetKey: string;
      content: string;
      sortOrder: number;
    };
    WikiImageItem: {
      imageUrl: string;
      caption?: string;
      sortOrder: number;
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
  get_api_auth_login: {
    parameters: {
      query?: {
        return_to?: string;
      };
      header?: never;
      path?: never;
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
  get_api_auth_callback: {
    parameters: {
      query?: {
        code?: string;
        state?: string;
        error?: string;
        error_description?: string;
      };
      header?: never;
      path?: never;
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
  post_api_auth_logout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
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
          'application/json': components['schemas']['AuthLogoutResponse'];
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
  get_api_auth_session: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
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
          'application/json': components['schemas']['AuthSessionResponse'];
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
  get_api_auth_userinfo: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
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
          'application/json': components['schemas']['AuthUserInfoResponse'];
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
  get_api_auth_organisations: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
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
          'application/json': components['schemas']['AuthOrganisationsResponse'];
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
  post_api_auth_organisation: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SwitchOrganisationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SwitchOrganisationResponse'];
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
  get_api_auth_step_up: {
    parameters: {
      query?: {
        return_to?: string;
        claimed?: string;
        retried?: string;
      };
      header?: never;
      path?: never;
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
  get_health: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
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
          'application/json': components['schemas']['HealthResponse'];
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
  get_health_ready: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
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
          'application/json': components['schemas']['ReadyResponse'];
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
  get_api_novels: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['NovelSortBy'];
        /** @description Case-insensitive substring match on the title. */
        search?: string;
        genre?: components['schemas']['NovelGenre'];
        tag?: components['schemas']['NovelTag'];
        status?: 'live' | 'retired';
        maxSexualContent?: components['schemas']['SexualContentRating'];
        maxViolence?: components['schemas']['ViolenceRating'];
        maxDarkContent?: components['schemas']['DarkContentRating'];
      };
      header?: never;
      path?: never;
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
          'application/json': components['schemas']['NovelCatalogResponse'];
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
  get_api_novels_slug: {
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
          'application/json': components['schemas']['NovelDetailResponse'];
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
  get_api_novels_slug_chapters: {
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
          'application/json': components['schemas']['ChapterListResponse'];
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
  get_api_novels_slug_chapters_ordinal: {
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
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterContentResponse'];
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
  get_api_me_progress: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
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
          'application/json': components['schemas']['ProgressListResponse'];
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
  get_api_novels_slug_progress: {
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
          'application/json': components['schemas']['ProgressResponse'];
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
  put_api_novels_slug_progress: {
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
        'application/json': components['schemas']['ProgressBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProgressResponse'];
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
  get_api_library: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
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
          'application/json': components['schemas']['LibraryListResponse'];
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
  post_api_library: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LibraryAddBody'];
      };
    };
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
  get_api_shared: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
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
          'application/json': components['schemas']['LibraryListResponse'];
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
  delete_api_library_slug: {
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
  get_api_novels_slug_wiki: {
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
          'application/json': components['schemas']['WikiListResponse'];
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
  get_api_novels_slug_wiki_entryKey: {
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
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WikiEntryDetailResponse'];
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
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type AuthLogoutResponse = components['schemas']['AuthLogoutResponse'];
export type AuthSessionResponse = components['schemas']['AuthSessionResponse'];
export type AuthUserInfoResponse = components['schemas']['AuthUserInfoResponse'];
export type AuthOrganisationsResponse = components['schemas']['AuthOrganisationsResponse'];
export type AuthOrganisationItem = components['schemas']['AuthOrganisationItem'];
export type SwitchOrganisationBody = components['schemas']['SwitchOrganisationBody'];
export type SwitchOrganisationResponse = components['schemas']['SwitchOrganisationResponse'];
export type HealthResponse = components['schemas']['HealthResponse'];
export type ReadyResponse = components['schemas']['ReadyResponse'];
export type HealthDependencies = components['schemas']['HealthDependencies'];
export type NovelUpsertBody = components['schemas']['NovelUpsertBody'];
export type NovelGenre = components['schemas']['NovelGenre'];
export type NovelTag = components['schemas']['NovelTag'];
export type SexualContentRating = components['schemas']['SexualContentRating'];
export type ViolenceRating = components['schemas']['ViolenceRating'];
export type DarkContentRating = components['schemas']['DarkContentRating'];
export type PublishResultResponse = components['schemas']['PublishResultResponse'];
export type NovelAccessBody = components['schemas']['NovelAccessBody'];
export type NovelAccessResponse = components['schemas']['NovelAccessResponse'];
export type ChapterUpsertBody = components['schemas']['ChapterUpsertBody'];
export type ChapterContentRating = components['schemas']['ChapterContentRating'];
export type ManifestItem = components['schemas']['ManifestItem'];
export type ManifestItem1 = components['schemas']['ManifestItem1'];
export type WikiEntryUpsertBody = components['schemas']['WikiEntryUpsertBody'];
export type WikiFacetInput = components['schemas']['WikiFacetInput'];
export type WikiImageInput = components['schemas']['WikiImageInput'];
export type WikiPublishResultResponse = components['schemas']['WikiPublishResultResponse'];
export type WikiManifestItem = components['schemas']['WikiManifestItem'];
export type WikiManifestItem1 = components['schemas']['WikiManifestItem1'];
export type SortOrder = components['schemas']['SortOrder'];
export type NovelSortBy = components['schemas']['NovelSortBy'];
export type NovelCatalogResponse = components['schemas']['NovelCatalogResponse'];
export type NovelSummary = components['schemas']['NovelSummary'];
export type NovelDetailResponse = components['schemas']['NovelDetailResponse'];
export type ChapterListResponse = components['schemas']['ChapterListResponse'];
export type ChapterMetaItem = components['schemas']['ChapterMetaItem'];
export type ChapterContentResponse = components['schemas']['ChapterContentResponse'];
export type ProgressListResponse = components['schemas']['ProgressListResponse'];
export type ProgressListItem = components['schemas']['ProgressListItem'];
export type ProgressResponse = components['schemas']['ProgressResponse'];
export type ProgressBody = components['schemas']['ProgressBody'];
export type LibraryListResponse = components['schemas']['LibraryListResponse'];
export type LibraryItem = components['schemas']['LibraryItem'];
export type LibraryAddBody = components['schemas']['LibraryAddBody'];
export type WikiListResponse = components['schemas']['WikiListResponse'];
export type WikiListItem = components['schemas']['WikiListItem'];
export type WikiEntryDetailResponse = components['schemas']['WikiEntryDetailResponse'];
export type WikiFacetItem = components['schemas']['WikiFacetItem'];
export type WikiImageItem = components['schemas']['WikiImageItem'];
export type LoginQueryParams = Exclude<paths['/api/auth/login']['get']['parameters']['query'], undefined>;
export type CallbackQueryParams = Exclude<paths['/api/auth/callback']['get']['parameters']['query'], undefined>;
export type StepUpQueryParams = Exclude<paths['/api/auth/step-up']['get']['parameters']['query'], undefined>;
export type GetAccessPathParams = Exclude<paths['/internal/novels/{slug}/access']['get']['parameters']['path'], undefined>;
export type InternalNovelsSlugManifestPathParams = Exclude<paths['/internal/novels/{slug}/manifest']['get']['parameters']['path'], undefined>;
export type InternalNovelsSlugWikiManifestPathParams = Exclude<paths['/internal/novels/{slug}/wiki/manifest']['get']['parameters']['path'], undefined>;
export type ListNovelsQueryParams = Exclude<paths['/api/novels']['get']['parameters']['query'], undefined>;
export type GetNovelPathParams = Exclude<paths['/api/novels/{slug}']['get']['parameters']['path'], undefined>;
export type ListChaptersPathParams = Exclude<paths['/api/novels/{slug}/chapters']['get']['parameters']['path'], undefined>;
export type GetChapterPathParams = Exclude<paths['/api/novels/{slug}/chapters/{ordinal}']['get']['parameters']['path'], undefined>;
export type GetProgressPathParams = Exclude<paths['/api/novels/{slug}/progress']['get']['parameters']['path'], undefined>;
export type ListEntriesPathParams = Exclude<paths['/api/novels/{slug}/wiki']['get']['parameters']['path'], undefined>;
export type GetEntryPathParams = Exclude<paths['/api/novels/{slug}/wiki/{entryKey}']['get']['parameters']['path'], undefined>;
