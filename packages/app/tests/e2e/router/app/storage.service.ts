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

export interface BlogPost {
  id: string;
  title: string;
  content: string;
}

export interface User {
  id: string;
  name: string;
}

/**
 * Declaring the constants
 */

@Injectable()
export class StorageService {
  public blogs: BlogPost[] = [];
  public users: User[] = [];
}
