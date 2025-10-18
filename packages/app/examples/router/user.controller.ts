/**
 * Importing npm packages
 */
import { utils } from '@shadow-library/common';

import { Controller, Route } from '@shadow-library/app';

import { OutputService } from './output.service';
import { StorageService } from './storage.service';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Controller({ cmd: 'user' })
export class UserController {
  constructor(
    private readonly outputService: OutputService,
    private readonly storageService: StorageService,
  ) {}

  @Route({ cmd: 'list' })
  async listUsers(): Promise<void> {
    await utils.temporal.sleep(10);
    if (this.storageService.users.length === 0) this.outputService.printWarning('No users available.');
    this.outputService.printData('User List', this.storageService.users);
  }

  @Route({ cmd: 'create' })
  async createUser(options: { name: string }): Promise<void> {
    await utils.temporal.sleep(10);
    const newUser = { id: this.storageService.users.length.toString(), name: options.name };
    this.storageService.users.push(newUser);
    this.outputService.printData('Created User', newUser);
  }

  @Route({ cmd: 'delete' })
  async deleteUser(options: { id: string }): Promise<void> {
    await utils.temporal.sleep(10);
    const userIndex = this.storageService.users.findIndex(user => user.id === options.id);
    if (userIndex === -1) return this.outputService.printWarning('User not found');
    this.storageService.users.splice(userIndex, 1);
    this.outputService.printData('Deleted User', { id: options.id });
  }
}
