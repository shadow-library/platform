/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { ProjectOwnershipGuard } from './project-ownership.middleware';
import { ProjectController } from './project/project.controller';
import { ProjectService } from './project/project.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, StorageModule, FastifyModule],
  controllers: [ProjectController, ProjectOwnershipGuard],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
