/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { KnowledgeRepository } from './knowledge.repository';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({ imports: [DatabaseModule], providers: [KnowledgeRepository], exports: [KnowledgeRepository] })
export class ExtractionModule {}
