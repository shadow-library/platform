/**
 * Importing npm packages
 */
import { Router, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppModule } from '@examples/user-auth/app.module';
import { FastifyRouter } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('User Auth', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;

  beforeAll(async () => {
    app = await ShadowFactory.create(AppModule).then(app => app.start());
    router = app.get(Router);
  });

  afterAll(() => app.stop());

  describe('GET /health', () => {
    it('should return the health status for unauthenticated users', async () => {
      const response = await router.mockRequest().get('/health');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({ status: 'ok' });
    });

    it('should return the health status for authenticated users', async () => {
      const response = await router.mockRequest().get('/health').headers({ 'x-user-id': '1' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({ status: 'ok' });
    });
  });

  describe('GET /api/users', () => {
    it('should return 401 for unauthenticated users', async () => {
      const response = await router.mockRequest().get('/api/users');
      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual({
        code: 'S004',
        type: 'UNAUTHENTICATED',
        message: 'Authentication credentials are required to access this resource',
      });
    });

    it('should return 200 for users with sufficient access level', async () => {
      const response = await router.mockRequest().get('/api/users').headers({ 'x-user-id': '3' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual([
        { id: 0, email: 'admin@example.com', name: 'Admin', password: 'Password@123', accessLevel: 10 },
        { id: 1, email: 'alice@example.com', name: 'Alice', password: 'password1', accessLevel: 1 },
        { id: 2, email: 'bob@example.com', name: 'Bob', password: 'password2', accessLevel: 4 },
        { id: 3, email: 'charlie@example.com', name: 'Charlie', password: 'password3', accessLevel: 7 },
      ]);
    });
  });

  describe('POST /api/users', () => {
    const newUser = { email: 'dave@example.com', name: 'Dave', password: 'password1', accessLevel: 1 };

    it('should return 401 for unauthenticated users', async () => {
      const response = await router.mockRequest().post('/api/users').body(newUser);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual({
        code: 'S004',
        type: 'UNAUTHENTICATED',
        message: 'Authentication credentials are required to access this resource',
      });
    });

    it('should return 403 for users with insufficient access level', async () => {
      const response = await router.mockRequest().post('/api/users').headers({ 'x-user-id': '3' }).body(newUser);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toStrictEqual({
        code: 'S005',
        type: 'UNAUTHORIZED',
        message: 'Access denied due to insufficient permissions to perform this operation',
      });
    });

    it('should return 201 for users with sufficient access level', async () => {
      const response = await router.mockRequest().post('/api/users').headers({ 'x-user-id': '0' }).body(newUser);
      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({ id: 4, ...newUser });
    });
  });

  describe('PATCH /api/users/:id', () => {
    const updateUser = { name: 'Alice Updated', accessLevel: 5 };

    it('should return 401 for unauthenticated users', async () => {
      const response = await router.mockRequest().patch('/api/users/1').body(updateUser);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual({
        code: 'S004',
        type: 'UNAUTHENTICATED',
        message: 'Authentication credentials are required to access this resource',
      });
    });

    it('should return 403 for users with insufficient access level', async () => {
      const response = await router.mockRequest().patch('/api/users/1').headers({ 'x-user-id': '1' }).body(updateUser);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toStrictEqual({
        code: 'S005',
        type: 'UNAUTHORIZED',
        message: 'Access denied due to insufficient permissions to perform this operation',
      });
    });

    it('should return 201 for users with sufficient access level', async () => {
      const response = await router.mockRequest().patch('/api/users/1').headers({ 'x-user-id': '2' }).body(updateUser);
      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({ id: 1, email: 'alice@example.com', ...updateUser, password: 'password1' });
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should return 401 for unauthenticated users', async () => {
      const response = await router.mockRequest().delete('/api/users/1');
      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual({
        code: 'S004',
        type: 'UNAUTHENTICATED',
        message: 'Authentication credentials are required to access this resource',
      });
    });

    it('should return 403 for users with insufficient access level', async () => {
      const response = await router.mockRequest().delete('/api/users/1').headers({ 'x-user-id': '2' });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toStrictEqual({
        code: 'S005',
        type: 'UNAUTHORIZED',
        message: 'Access denied due to insufficient permissions to perform this operation',
      });
    });

    it('should return 204 for users with sufficient access level', async () => {
      const response = await router.mockRequest().delete('/api/users/1').headers({ 'x-user-id': '3' });
      expect(response.statusCode).toBe(204);
    });
  });
});
