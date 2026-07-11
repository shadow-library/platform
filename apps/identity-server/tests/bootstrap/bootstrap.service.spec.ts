/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { OAuthClientService } from '@server/modules/auth/oauth';
import { BootstrapService } from '@server/modules/bootstrap';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('bootstrap').init();
const ADMIN_EMAIL = 'admin@shadow-apps.com';

describe('BootstrapService', () => {
  it('should provision the platform application with the IAM admin role', () => {
    const application = env.getService(ApplicationService).getApplication('shadow-identity');
    expect(application).not.toBeNull();
    expect(application?.roles.map(role => role.roleName)).toContain('IAMAdmin');
  });

  it('should provision an active, verified bootstrap administrator', async () => {
    const admin = await env.getService(UserService).getUser(ADMIN_EMAIL);
    expect(admin).not.toBeNull();
    expect(admin?.status).toBe('ACTIVE');

    const emails = await env.getPostgresClient().select().from(schema.userEmails);
    const adminEmail = emails.find(email => email.emailId === ADMIN_EMAIL);
    expect(adminEmail?.verifiedAt).not.toBeNull();
  });

  it('should not seed the old hardcoded super-admin credentials', async () => {
    const superAdmin = await env.getService(UserService).getUser('super-admin@shadow-apps.com');
    expect(superAdmin).toBeNull();
  });

  it('should be idempotent when run again', async () => {
    const bootstrap = new BootstrapService(
      env.getService(ApplicationService),
      env.getService(ApplicationRoleService),
      env.getService(UserService),
      env.getService(OAuthClientService),
    );
    await bootstrap.onModuleInit();

    const admins = (await env.getPostgresClient().select().from(schema.userEmails)).filter(email => email.emailId === ADMIN_EMAIL);
    expect(admins).toHaveLength(1);

    const applications = (await env.getPostgresClient().select().from(schema.applications)).filter(app => app.name === 'shadow-identity');
    expect(applications).toHaveLength(1);
  });
});
