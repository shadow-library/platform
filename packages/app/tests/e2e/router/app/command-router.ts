/**
 * Importing npm packages
 */
import { ControllerRouteMetadata, Router } from '@shadow-library/app';

import { OutputService } from './output.service';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface Command {
  cmd: string;
  description: string;
  children: Command[];
  handler: (options?: object) => void | Promise<void>;
}

/**
 * Declaring the constants
 */

export class CommandRouter extends Router {
  private readonly commands: Command[] = [];

  constructor(private readonly outputService: OutputService) {
    super();
  }

  override register(controllers: ControllerRouteMetadata[]): void {
    for (const controller of controllers) {
      const metadata = controller.metadata;
      const command: Command = {
        cmd: metadata.cmd,
        description: metadata.description ?? '',
        children: metadata.children ?? [],
        handler: () => this.outputService.printError(`Command "${metadata.cmd}" does not have a default handler defined.`),
      };

      for (const route of controller.routes) {
        const routeMetadata = route.metadata;
        if (routeMetadata.default) command.handler = route.handler;
        command.children.push({ cmd: routeMetadata.cmd, description: routeMetadata.description ?? '', handler: route.handler, children: [] });
      }

      this.commands.push(command);
    }
  }

  start(): void {
    this.outputService.print('Command Router started');
  }

  stop(): void {
    this.outputService.print('Command Router stopped');
  }

  handleCommand(command: string, options?: object): void | Promise<void> {
    const cmdParts = command.split(' ');

    let currentCommand = this.commands.find(cmd => cmd.cmd === cmdParts[0]);
    if (!currentCommand) return this.outputService.printError(`Command "${cmdParts[0]}" not found.`);
    for (let index = 1; index < cmdParts.length && currentCommand; index++) {
      const cmd: Command | undefined = currentCommand.children.find(child => child.cmd === cmdParts[index]);
      if (!cmd) break;
      currentCommand = cmd;
    }

    return currentCommand.handler(options);
  }
}
