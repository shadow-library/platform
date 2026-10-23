import { type RoleCatalogManifest } from '@shadow-library/auth';

import {
  ADMIN_PERMISSION,
  CURATE_PERMISSION,
  GENERATION_RUN_PERMISSION,
  ILLUSTRATIONS_WRITE_PERMISSION,
  PROJECTS_READ_PERMISSION,
  PROJECTS_WRITE_PERMISSION,
} from '@server/constants';

/**
 * Pushed to identity on boot as the complete truth for this application, so a permission or role dropped from here is deleted there, cascading into its assignments.
 *
 * `NovelForgeAuthor` is the default role because an organisation admin may only grant a bot what they hold themselves; it is not bot-grantable, since a bot is granted one
 * resource at a time.
 * Each bot-grantable role is the sole claimant of its (resource, level) pair and the `projects` write role carries the read role's permissions, both enforced by identity.
 * `NovelForgeIllustrator` and `NovelForgeGenerator` are add-ons: every content route takes `novel-forge:projects:read` as its floor, so either alone reaches nothing without a
 * projects role.
 * `NovelForgeAdmin` opens run inspection (prompts, raw model output, cost), so it is neither default nor bot-grantable.
 */
const EVERYDAY_PERMISSIONS = [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION, ILLUSTRATIONS_WRITE_PERMISSION, GENERATION_RUN_PERMISSION];

export const NOVEL_FORGE_ROLE_CATALOG: RoleCatalogManifest = {
  permissions: [
    { name: PROJECTS_READ_PERMISSION, description: 'Read projects and the chapters, bible, planning and export material under them' },
    { name: PROJECTS_WRITE_PERMISSION, description: 'Create and edit projects and the chapters, bible and planning material under them' },
    { name: ILLUSTRATIONS_WRITE_PERMISSION, description: 'Upload, attach and manage project illustrations' },
    { name: GENERATION_RUN_PERMISSION, description: 'Run AI generation — chat, drafting, reviews and image generation — which incurs model spend' },
    { name: CURATE_PERMISSION, description: "Reach projects shared with the organisation and publish a novel under its original author's name" },
    { name: ADMIN_PERMISSION, description: 'Inspect workflow runs: prompt anatomy, context packs, per-call latency and raw model output' },
  ],
  roles: [
    {
      name: 'NovelForgeAuthor',
      description: 'Everyday authoring: read and write projects, illustrate them, and run AI generation',
      permissions: EVERYDAY_PERMISSIONS,
      default: true,
    },
    {
      name: 'NovelForgeProjectsReader',
      description: 'Reads projects and everything under them, and writes nothing',
      permissions: [PROJECTS_READ_PERMISSION],
      bot: { resource: 'projects', level: 'read' },
    },
    {
      name: 'NovelForgeProjectsWriter',
      description: 'Reads and writes projects, chapters, bible and planning material',
      permissions: [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION],
      bot: { resource: 'projects', level: 'write' },
    },
    {
      name: 'NovelForgeIllustrator',
      description: 'Uploads and attaches project illustrations',
      permissions: [ILLUSTRATIONS_WRITE_PERMISSION],
      bot: { resource: 'illustrations', level: 'write' },
    },
    {
      name: 'NovelForgeGenerator',
      description: 'Runs AI generation, which incurs model spend',
      permissions: [GENERATION_RUN_PERMISSION],
      bot: { resource: 'generation', level: 'write', sensitive: true },
    },
    {
      name: 'NovelForgeCurator',
      description: "Organisation member who works on the organisation's shared projects",
      permissions: [CURATE_PERMISSION],
    },
    {
      name: 'NovelForgeAdmin',
      description: 'Platform operator who inspects workflow runs, their prompts and raw model output',
      permissions: [ADMIN_PERMISSION],
    },
  ],
};
