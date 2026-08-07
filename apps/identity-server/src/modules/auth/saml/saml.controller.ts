import { createHash } from 'node:crypto';

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { Config } from '@shadow-library/common';
import { Get, Header, HttpController, Query, Req, Res } from '@shadow-library/fastify';

import { Auth } from '@server/modules/access';
import { SESSION_COOKIE_NAME } from '@server/modules/auth/session';

import { escapeXml } from './saml-xml';
import { SamlResumeQuery, SamlSsoQuery } from './saml.dto';
import { SamlService, SsoResult } from './saml.service';

const SUBMIT_SCRIPT = 'document.forms[0].submit();';
const SUBMIT_SCRIPT_CSP = `default-src 'none'; form-action *; script-src 'sha256-${createHash('sha256').update(SUBMIT_SCRIPT).digest('base64')}'; style-src 'unsafe-inline'`;

@HttpController()
export class SamlController {
  private readonly issuer = Config.get('oauth.issuer');
  private readonly loginUrl = Config.get('oauth.login-url');

  constructor(private readonly samlService: SamlService) {}

  @Get('/saml2/metadata')
  @Auth({ public: true })
  @Header('cache-control', 'public, max-age=300')
  getSamlMetadata(@Res() reply: FastifyReply): void {
    reply.type('application/xml; charset=utf-8').send(this.samlService.getMetadata());
  }

  @Get('/saml2/sso')
  @Auth({ public: true })
  async handleSamlSso(@Query() query: SamlSsoQuery, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const result = await this.samlService.handleSsoRequest(query.SAMLRequest, query.RelayState, request.cookies[SESSION_COOKIE_NAME]);
    this.dispatch(result, reply);
  }

  @Get('/saml2/sso/resume')
  @Auth({ public: true })
  async resumeSamlSso(@Query() query: SamlResumeQuery, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const result = await this.samlService.resume(query.rid, request.cookies[SESSION_COOKIE_NAME]);
    this.dispatch(result, reply);
  }

  private dispatch(result: SsoResult, reply: FastifyReply): void {
    if (result.kind === 'login') {
      const returnTo = encodeURIComponent(`${this.issuer}/saml2/sso/resume?rid=${result.resumeId}`);
      reply.status(302).redirect(`${this.loginUrl}?return_to=${returnTo}`);
      return;
    }

    if (result.kind === 'denied') {
      const url = new URL('/error', this.loginUrl);
      url.searchParams.set('error', 'access_denied');
      url.searchParams.set('application', result.applicationName);
      reply.status(302).redirect(url.toString());
      return;
    }

    const relayState = result.relayState ? `<input type="hidden" name="RelayState" value="${escapeXml(result.relayState)}"/>` : '';
    const page =
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signing you in…</title></head>` +
      `<body><noscript><p>Continue to your application:</p></noscript>` +
      `<form method="post" action="${escapeXml(result.acsUrl)}">` +
      `<input type="hidden" name="SAMLResponse" value="${result.samlResponse}"/>${relayState}` +
      `<noscript><button type="submit">Continue</button></noscript>` +
      `</form><script>${SUBMIT_SCRIPT}</script></body></html>`;
    reply.header('content-security-policy', SUBMIT_SCRIPT_CSP).header('cache-control', 'no-store').type('text/html; charset=utf-8').send(page);
  }
}
