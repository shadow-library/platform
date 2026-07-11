/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { ErrorPage } from './error-page';
import { LoginPage } from './login-page';
import { RecoverPage } from './recover-page';
import { RegisterPage } from './register-page';
import { type RouteDefinition } from '../lib/router';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The route table grows with each page milestone; unknown paths fall back to the error page.
 */

export const routes: RouteDefinition[] = [
  { path: '/login', component: LoginPage },
  { path: '/register', component: RegisterPage },
  { path: '/recover', component: RecoverPage },
  { path: '/error', component: ErrorPage },
];
