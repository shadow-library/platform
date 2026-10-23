import { Injectable } from '@shadow-library/app';

export interface BlogPost {
  id: string;
  title: string;
  content: string;
}

export interface User {
  id: string;
  name: string;
}

@Injectable()
export class StorageService {
  public blogs: BlogPost[] = [];
  public users: User[] = [];
}
