/**
 * Importing npm packages
 */
import assert from 'assert';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '@lib/constants';
import { Fn } from '@lib/interfaces';
import { Logger } from '@lib/services';

import { Task } from './task';

/**
 * Defining types
 */

export interface TaskManagerOptions {
  rollbackOnError: boolean;
  name: string;
}

export type ITask = Task<any> | Fn;

/**
 * Declaring the constants
 */

export class TaskManager {
  private static readonly logger = Logger.getLogger(NAMESPACE, 'TaskManager');

  private readonly tasks: ITask[] = [];
  private readonly results = new Map<ITask, any>();
  private readonly options: TaskManagerOptions = { rollbackOnError: true, name: 'Unknown Task Orchestrator' };

  constructor(opts: Partial<TaskManagerOptions> = {}) {
    this.options = { ...this.options, ...opts };
  }

  static create(opts?: Partial<TaskManagerOptions>): TaskManager {
    return new TaskManager(opts);
  }

  private async rollback(startIndex: number): Promise<void> {
    const logger = TaskManager.logger;
    const { name } = this.options;

    logger.debug(`${name}: Rolling back tasks from index ${startIndex}`);
    for (let index = startIndex; index >= 0; index--) {
      const task = this.tasks[index];
      assert(task, `Rollback task at index ${index} is undefined, which is not possible`);

      if (task instanceof Task && task.hasRollback()) {
        await task.executeRollback();
        logger.info(`${name}: Rolled back task ${index + 1}`);
      } else logger.debug(`${name}: Skipping rollback for task ${index + 1}, no rollback function defined`);
    }
  }

  addTask(task: ITask): this {
    this.tasks.push(task);
    return this;
  }

  getResult<T = any>(task: ITask): T {
    return this.results.get(task);
  }

  async execute(): Promise<Map<ITask, any>> {
    const logger = TaskManager.logger;
    const { name, rollbackOnError } = this.options;

    for (let index = 0; index < this.tasks.length; index++) {
      const task = this.tasks[index];
      assert(task, `Task at index ${index} is undefined, which is not possible`);

      try {
        logger.debug(`${name}: Executing task ${index + 1} of ${this.tasks.length}`);
        const result = await (typeof task === 'function' ? task() : task.execute());
        logger.debug(`${name}: Task ${index + 1} completed successfully`);
        this.results.set(task, result);
      } catch (error) {
        logger.error(`${name}: Task ${index + 1} failed`, error);
        if (rollbackOnError) await this.rollback(index - 1);
        throw error;
      }
    }

    logger.debug(`${name}: All tasks completed successfully`);
    return this.results;
  }
}
