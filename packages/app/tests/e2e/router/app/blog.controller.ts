/**
 * Importing npm packages
 */
import { utils } from '@shadow-library/common';

import { Controller, Route } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OutputService } from './output.service';
import { type BlogPost, StorageService } from './storage.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Controller({ cmd: 'blog' })
export class BlogController {
  constructor(
    private readonly outputService: OutputService,
    private readonly storageService: StorageService,
  ) {}

  @Route({ cmd: 'list' })
  async listPosts(): Promise<void> {
    await utils.temporal.sleep(10);
    const data = this.storageService.blogs.map(post => ({ id: post.id, title: post.title }));
    if (this.storageService.blogs.length === 0) this.outputService.printWarning('No blog posts available.');
    else this.outputService.printData('Blog Posts', data);
  }

  @Route({ cmd: 'create' })
  async createPost(options: { title: string; content: string }): Promise<void> {
    await utils.temporal.sleep(10);
    const newPost: BlogPost = { id: this.storageService.blogs.length.toString(), title: options.title, content: options.content };
    this.storageService.blogs.push(newPost);
    this.outputService.printData('Created Blog Post', newPost);
  }

  @Route({ cmd: 'delete' })
  async deletePost(options: { id: string }): Promise<void> {
    await utils.temporal.sleep(10);
    const postIndex = this.storageService.blogs.findIndex(post => post.id === options.id);
    if (postIndex === -1) throw new Error('Post not found');
    this.storageService.blogs.splice(postIndex, 1);
    this.outputService.printData('Deleted Blog Post', { id: options.id });
  }

  @Route({ cmd: 'update' })
  async updatePost(options: BlogPost): Promise<void> {
    await utils.temporal.sleep(10);
    const postIndex = this.storageService.blogs.findIndex(post => post.id === options.id);
    if (postIndex === -1) throw new Error('Post not found');
    this.storageService.blogs[postIndex] = { id: options.id, title: options.title, content: options.content };
    this.outputService.printData('Updated Blog Post', this.storageService.blogs[postIndex]);
  }

  @Route({ cmd: 'get' })
  getPost(options: { id: string }): void {
    const post = this.storageService.blogs.find(post => post.id === options.id);
    if (!post) throw new Error('Post not found');
    this.outputService.printData('Blog Post', post);
  }

  @Route({ cmd: 'help', default: true })
  help(): void {
    this.outputService.printHelp([
      { cmd: 'list', description: 'List all blog posts' },
      { cmd: 'create', description: 'Create a new blog post' },
      { cmd: 'delete', description: 'Delete a blog post by ID' },
      { cmd: 'update', description: 'Update a blog post by ID' },
      { cmd: 'get', description: 'Get a blog post by ID' },
    ]);
  }
}
