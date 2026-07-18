/**
 * Importing npm packages
 */
import { type ReactElement, useEffect, useState } from 'react';
import { Badge, Button, Card, Spinner } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { AuthShell } from '../components/auth-shell';
import { api, ApiError, type ConsentPrompt } from '../lib/api';
import { isLoggedIn, safeReturnTo } from '../lib/context';

/**
 * Defining types
 */

interface AuthorizeRequest {
  returnTo: string;
  clientId: string;
  scope: string;
  redirectUri?: string;
  state?: string;
}

type PageState =
  | { kind: 'LOADING' }
  | { kind: 'INVALID' }
  | { kind: 'PROMPT'; request: AuthorizeRequest; prompt: ConsentPrompt }
  | { kind: 'DECIDING'; request: AuthorizeRequest; prompt: ConsentPrompt };

/**
 * Declaring the constants
 *
 * The page trusts nothing from the URL beyond the same-origin authorize link: client name and
 * scope descriptions come from the server, and the deny redirect is validated server-side
 * against the client's registered URIs.
 */

function parseAuthorizeRequest(): AuthorizeRequest | null {
  const returnTo = safeReturnTo();
  if (!returnTo) return null;
  const params = new URL(returnTo).searchParams;
  const clientId = params.get('client_id');
  if (!clientId) return null;
  return { returnTo, clientId, scope: params.get('scope') ?? 'openid', redirectUri: params.get('redirect_uri') ?? undefined, state: params.get('state') ?? undefined };
}

export function ConsentPage(): ReactElement {
  const [state, setState] = useState<PageState>({ kind: 'LOADING' });

  useEffect(() => {
    const request = parseAuthorizeRequest();
    if (!request) return setState({ kind: 'INVALID' });
    if (!isLoggedIn()) return window.location.replace(`/login?return_to=${encodeURIComponent(request.returnTo)}`);

    api
      .consentPrompt(request.clientId, request.scope)
      .then(prompt => {
        // Already-covered grants (or first-party clients) skip the prompt and resume authorize.
        if (prompt.alreadyGranted || prompt.isFirstParty) window.location.replace(request.returnTo);
        else setState({ kind: 'PROMPT', request, prompt });
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 401) window.location.replace(`/login?return_to=${encodeURIComponent(request.returnTo)}`);
        else setState({ kind: 'INVALID' });
      });
  }, []);

  const decide = async (decision: 'APPROVE' | 'DENY'): Promise<void> => {
    if (state.kind !== 'PROMPT') return;
    const { request, prompt } = state;
    setState({ kind: 'DECIDING', request, prompt });
    const scopeNames = prompt.scopes.map(scope => scope.name);
    const result = await api.consentDecide({ clientId: request.clientId, scopeNames, decision, redirectUri: request.redirectUri, state: request.state }).catch(() => null);
    if (!result) return setState({ kind: 'PROMPT', request, prompt });
    if (decision === 'APPROVE') return window.location.assign(request.returnTo);
    window.location.assign(result.redirectTo ?? '/account');
  };

  if (state.kind === 'LOADING')
    return (
      <AuthShell>
        <Card.Body>
          <div className="center" aria-busy="true">
            <Spinner size="lg" label="Loading consent request" />
          </div>
        </Card.Body>
      </AuthShell>
    );

  if (state.kind === 'INVALID')
    return (
      <AuthShell>
        <Card.Header title="Invalid authorization request" />
        <Card.Body>
          <p className="text-secondary">This consent link is incomplete or was tampered with. Return to the application and try again.</p>
        </Card.Body>
      </AuthShell>
    );

  const { prompt } = state;
  const busy = state.kind === 'DECIDING';

  return (
    <AuthShell>
      <Card.Header title={`${prompt.clientName} wants to access your account`} />
      <Card.Body>
        <div className="auth-step stack gap-16">
          <p className="text-secondary">Approving lets this application:</p>
          <ul className="stack gap-8">
            {prompt.scopes.map(scope => (
              <li key={scope.name} className="cluster gap-8">
                <span>{scope.description ?? scope.name}</span>
                {scope.isSensitive ? <Badge intent="warning">Sensitive</Badge> : null}
              </li>
            ))}
          </ul>
          <p className="text-tertiary text-body-sm">You can withdraw this access at any time from your account page.</p>
        </div>
      </Card.Body>
      <Card.Footer>
        <div className="cluster gap-8">
          <Button variant="primary" loading={busy} onClick={() => void decide('APPROVE')}>
            Allow access
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void decide('DENY')}>
            Deny
          </Button>
        </div>
      </Card.Footer>
    </AuthShell>
  );
}
