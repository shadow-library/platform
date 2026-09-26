import { OPEN_QUESTIONS_DOC, ORGANISED_TIMELINE_DOC } from '../ai/context/bible-docs';
import { type PageRef } from './bible-page';

export const ORGANISE_STEP_KEY = 'organise';
export const TIMELINE_PAGE: PageRef = ORGANISED_TIMELINE_DOC;
export const OPEN_QUESTIONS_PAGE: PageRef = OPEN_QUESTIONS_DOC;
export const PREMISE_PAGE: PageRef = { section: 'project', slug: 'premise' };
export const CAST_PAGE: PageRef = { section: 'project', slug: 'cast' };
