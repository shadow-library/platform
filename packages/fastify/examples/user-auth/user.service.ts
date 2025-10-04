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

export interface User {
  id: number;
  name: string;
  email: string;
  accessLevel: number;
  password: string;
}

/**
 * Declaring the constants
 */

@Injectable()
export class UserService {
  private readonly users: User[] = [
    { id: 0, name: 'Admin', email: 'admin@example.com', accessLevel: 10, password: 'Password@123' },
    { id: 1, name: 'Alice', email: 'alice@example.com', accessLevel: 1, password: 'password1' },
    { id: 2, name: 'Bob', email: 'bob@example.com', accessLevel: 4, password: 'password2' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com', accessLevel: 7, password: 'password3' },
  ];

  async getUserById(id: number): Promise<User | undefined> {
    await Bun.sleep(10);
    return this.users.find(user => user.id === id);
  }

  async getAllUsers(): Promise<User[]> {
    await Bun.sleep(10);
    return this.users;
  }

  async createUser(user: Omit<User, 'id'>): Promise<User> {
    await Bun.sleep(10);
    const newUser: User = { id: this.users.length, ...user };
    this.users.push(newUser);
    return newUser;
  }

  async updateUser(id: number, update: Partial<User>): Promise<User | undefined> {
    const user = await this.getUserById(id);
    if (!user) throw new Error('User not found');
    if (update.name !== undefined) user.name = update.name;
    if (update.email !== undefined) user.email = update.email;
    if (update.accessLevel !== undefined) user.accessLevel = update.accessLevel;
    return user;
  }

  async deleteUser(id: number): Promise<boolean> {
    await Bun.sleep(10);
    const index = this.users.findIndex(user => user.id === id);
    if (index === -1) throw new Error('User not found');
    this.users.splice(index, 1);
    return true;
  }
}
