/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class OutputService {
  private log(message: string): void {
    console.log(message); // eslint-disable-line no-console
  }

  print(message: string): void {
    this.log(message);
  }

  printError(message: string): void {
    this.log(message);
  }

  printWarning(message: string): void {
    this.log(message);
  }

  printInfo(message: string): void {
    this.log(message);
  }

  printHelp(commands: { cmd: string; description: string }[]): void {
    const data = commands.map(val => `${val.cmd}: ${val.description}`);
    this.log('Available commands:');
    this.printObject(data, 0);
  }

  printData(title: string, data: Record<string, any>): void {
    this.log(title);
    this.printObject(data, 0);
  }

  private printObject(obj: any, indentLevel = 0): void {
    const indent = '  '.repeat(indentLevel);

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];

        if (Array.isArray(value)) {
          this.log(`${indent}${key}:`);
          value.forEach((item, index) => {
            if (typeof item === 'object' && item !== null) {
              this.log(`${indent}  - [${index}]:`);
              this.printObject(item, indentLevel + 2);
            } else {
              this.log(`${indent}  - ${item}`);
            }
          });
        } else if (typeof value === 'object' && value !== null) {
          this.log(`${indent}${key}:`);
          this.printObject(value, indentLevel + 1);
        } else {
          this.log(`${indent}${key}: ${value}`);
        }
      }
    }
  }
}
