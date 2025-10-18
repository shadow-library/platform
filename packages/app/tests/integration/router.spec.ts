/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppModule } from '@examples/router/app.module';
import { CommandRouter } from '@examples/router/command-router';
import { OutputService } from '@examples/router/output.service';
import { StorageService } from '@examples/router/storage.service';
import { Router, ShadowApplication, ShadowFactory } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Router', () => {
  let app: ShadowApplication;
  let router: CommandRouter;
  let storage: StorageService;
  let output: string[] = [];

  beforeEach(async () => {
    app = await ShadowFactory.create(AppModule);
    router = app.get(Router);
    storage = app.select(AppModule).get(StorageService);

    output = [];
    const outputService = app.get(OutputService);
    outputService['log'] = (message: string) => output.push(message);
  });

  describe('Blog Controller', () => {
    it('should create a blog post', async () => {
      await router.handleCommand('blog create', { title: 'Test Blog', content: 'This is a test blog.' });
      expect(output).toStrictEqual(['Created Blog Post', 'id: 0', 'title: Test Blog', 'content: This is a test blog.']);
    });

    it('should list blog posts', async () => {
      storage.blogs = [{ id: '0', title: 'Test Blog', content: 'This is a test blog.' }];
      await router.handleCommand('blog list');
      expect(output).toStrictEqual(['Blog Posts', '0:', '  id: 0', '  title: Test Blog']);
    });

    it('should update a blog post', async () => {
      storage.blogs = [{ id: '0', title: 'Test Blog', content: 'This is a test blog.' }];
      await router.handleCommand('blog update', { id: '0', title: 'Updated Blog', content: 'This is an updated blog.' });
      expect(output).toStrictEqual(['Updated Blog Post', 'id: 0', 'title: Updated Blog', 'content: This is an updated blog.']);
      expect(storage.blogs).toStrictEqual([{ id: '0', title: 'Updated Blog', content: 'This is an updated blog.' }]);
    });

    it('should delete a blog post', async () => {
      storage.blogs = [{ id: '0', title: 'Test Blog', content: 'This is a test blog.' }];
      await router.handleCommand('blog delete', { id: '0' });
      expect(output).toStrictEqual(['Deleted Blog Post', 'id: 0']);
      expect(storage.blogs).toStrictEqual([]);
    });

    it('should get a blog post', async () => {
      storage.blogs = [{ id: '0', title: 'Test Blog', content: 'This is a test blog.' }];
      await router.handleCommand('blog get', { id: '0' });
      expect(output).toStrictEqual(['Blog Post', 'id: 0', 'title: Test Blog', 'content: This is a test blog.']);
    });

    it('should handle non-existent blog post', async () => {
      storage.blogs = [];
      await router.handleCommand('blog get', { id: '999' });
      expect(output).toStrictEqual(['Post not found']);
    });

    it('should handle invalid command', () => {
      router.handleCommand('blog invalid');
      expect(output).toStrictEqual([
        'Available commands:',
        '0: list: List all blog posts',
        '1: create: Create a new blog post',
        '2: delete: Delete a blog post by ID',
        '3: update: Update a blog post by ID',
        '4: get: Get a blog post by ID',
      ]);
    });
  });

  describe('User Controller', () => {
    it('should create a user', async () => {
      await router.handleCommand('user create', { name: 'John Doe' });
      expect(output).toStrictEqual(['Created User', 'id: 0', 'name: John Doe']);
    });

    it('should list users', async () => {
      storage.users = [{ id: '0', name: 'John Doe' }];
      await router.handleCommand('user list');
      expect(output).toStrictEqual(['User List', '0:', '  id: 0', '  name: John Doe']);
    });

    it('should delete a user', async () => {
      storage.users = [{ id: '0', name: 'John Doe' }];
      await router.handleCommand('user delete', { id: '0' });
      expect(output).toStrictEqual(['Deleted User', 'id: 0']);
      expect(storage.users).toStrictEqual([]);
    });
  });
});
