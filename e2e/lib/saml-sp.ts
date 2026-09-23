/**
 * Importing npm packages
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

import { SignedXml } from 'xml-crypto';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface AuthnRequestOptions {
  /** The SP's `entityId`, sent as the request's `Issuer`; identity resolves the registered service provider from it. */
  entityId: string;
  /** Sent as `AssertionConsumerServiceURL`. Identity refuses a value that differs from the registered ACS, and accepts a request that omits it. */
  acsUrl?: string;
}

export interface AuthnRequest {
  readonly id: string;
  readonly xml: string;
  /** `DEFLATE`d and base64-encoded, the form the HTTP-Redirect binding puts in `SAMLRequest`. */
  readonly encoded: string;
}

export interface AutoPostForm {
  readonly acsUrl: string;
  /** Still base64 — `parseSamlResponse` decodes it. */
  readonly samlResponse: string;
  readonly relayState?: string;
}

export interface SamlAssertion {
  readonly audience: string;
  readonly nameId: string;
  readonly nameIdFormat: string;
  readonly sessionIndex: string;
  readonly recipient: string;
  readonly inResponseTo: string;
  readonly notOnOrAfter: string;
  readonly attributes: Readonly<Record<string, string>>;
  /** The certificate the assertion names in its own `KeyInfo`, as PEM. */
  readonly signingCertificate: string;
}

export interface SamlResponse {
  readonly xml: string;
  readonly status: string;
  readonly destination: string;
  readonly inResponseTo: string;
  readonly issuer: string;
  readonly assertion: SamlAssertion;
}

/**
 * Declaring the constants
 *
 * A service provider scripted end to end in the test process: it builds the `AuthnRequest` identity expects on the
 * HTTP-Redirect binding, reads the auto-post form identity answers with, and verifies the assertion's XML signature
 * against the certificate published in the IdP metadata. Nothing listens on the network — identity never contacts an
 * ACS itself, it only hands the browser a form pointed at one, so the registered ACS URL can stay fictional.
 */

const NS_PROTOCOL = 'urn:oasis:names:tc:SAML:2.0:protocol';
const NS_ASSERTION = 'urn:oasis:names:tc:SAML:2.0:assertion';

export class SamlSpError extends Error {
  override readonly name = 'SamlSpError';
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The first opening tag of `localName`, whatever namespace prefix carries it. */
function openingTag(xml: string, localName: string): string {
  const match = new RegExp(`<(?:[\\w.-]+:)?${localName}\\b[^>]*>`).exec(xml);
  if (!match) throw new SamlSpError(`<${localName}> is missing`);
  return match[0];
}

function attributeValue(tag: string, name: string): string {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  if (match?.[1] === undefined) throw new SamlSpError(`${name} is missing from ${tag}`);
  return unescapeXml(match[1]);
}

function elementText(xml: string, localName: string): string {
  const match = new RegExp(`<(?:[\\w.-]+:)?${localName}\\b[^>]*>([^<]*)</(?:[\\w.-]+:)?${localName}>`).exec(xml);
  if (match?.[1] === undefined) throw new SamlSpError(`<${localName}> has no text`);
  return unescapeXml(match[1]);
}

function certificateToPem(base64: string): string {
  const body = base64.replace(/\s+/g, '').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN CERTIFICATE-----\n${body.endsWith('\n') ? body : `${body}\n`}-----END CERTIFICATE-----\n`;
}

function readAttributes(xml: string): Record<string, string> {
  const pattern = /<(?:[\w.-]+:)?Attribute\s+Name="([^"]+)"[^>]*>\s*<(?:[\w.-]+:)?AttributeValue[^>]*>([^<]*)<\/(?:[\w.-]+:)?AttributeValue>/g;
  const attributes: Record<string, string> = {};
  for (const match of xml.matchAll(pattern)) attributes[unescapeXml(match[1] as string)] = unescapeXml(match[2] as string);
  return attributes;
}

/** Wraps `xml` in the `SAMLRequest` encoding of the HTTP-Redirect binding: raw DEFLATE, then base64. */
export function encodeSamlRequest(xml: string): string {
  return deflateRawSync(Buffer.from(xml, 'utf8')).toString('base64');
}

export function samlAuthnRequest(options: AuthnRequestOptions): AuthnRequest {
  const id = `_${randomUUID()}`;
  const acs = options.acsUrl ? ` AssertionConsumerServiceURL="${options.acsUrl}"` : '';
  const xml =
    `<samlp:AuthnRequest xmlns:samlp="${NS_PROTOCOL}" xmlns:saml="${NS_ASSERTION}" ID="${id}" Version="2.0" ` +
    `IssueInstant="${new Date().toISOString()}"${acs}><saml:Issuer>${options.entityId}</saml:Issuer></samlp:AuthnRequest>`;
  return { id, xml, encoded: encodeSamlRequest(xml) };
}

/** An opaque value an SP round-trips through `RelayState`. */
export function relayStateToken(): string {
  return `e2e-relay-${randomBytes(6).toString('hex')}`;
}

export function parseAutoPostForm(html: string): AutoPostForm {
  const action = /<form[^>]*\baction="([^"]+)"/.exec(html);
  const samlResponse = /name="SAMLResponse" value="([^"]+)"/.exec(html);
  if (!action?.[1] || !samlResponse?.[1]) throw new SamlSpError(`no SAML auto-post form in ${html.slice(0, 200)}`);
  const relayState = /name="RelayState" value="([^"]*)"/.exec(html);
  return {
    acsUrl: unescapeXml(action[1]),
    samlResponse: samlResponse[1],
    ...(relayState?.[1] === undefined ? {} : { relayState: unescapeXml(relayState[1]) }),
  };
}

export function parseSamlResponse(base64: string): SamlResponse {
  const xml = Buffer.from(base64, 'base64').toString('utf8');
  if (!xml.includes('Response')) throw new SamlSpError(`not a SAML response: ${xml.slice(0, 200)}`);
  const responseTag = openingTag(xml, 'Response');
  const assertionXml = /<(?:[\w.-]+:)?Assertion\b[\s\S]*<\/(?:[\w.-]+:)?Assertion>/.exec(xml)?.[0];
  if (!assertionXml) throw new SamlSpError('the response carries no assertion');

  const nameIdTag = openingTag(assertionXml, 'NameID');
  const confirmationTag = openingTag(assertionXml, 'SubjectConfirmationData');
  return {
    xml,
    status: attributeValue(openingTag(xml, 'StatusCode'), 'Value'),
    destination: attributeValue(responseTag, 'Destination'),
    inResponseTo: attributeValue(responseTag, 'InResponseTo'),
    issuer: elementText(xml, 'Issuer'),
    assertion: {
      audience: elementText(assertionXml, 'Audience'),
      nameId: elementText(assertionXml, 'NameID'),
      nameIdFormat: attributeValue(nameIdTag, 'Format'),
      sessionIndex: attributeValue(openingTag(assertionXml, 'AuthnStatement'), 'SessionIndex'),
      recipient: attributeValue(confirmationTag, 'Recipient'),
      inResponseTo: attributeValue(confirmationTag, 'InResponseTo'),
      notOnOrAfter: attributeValue(confirmationTag, 'NotOnOrAfter'),
      attributes: readAttributes(assertionXml),
      signingCertificate: certificateToPem(elementText(assertionXml, 'X509Certificate')),
    },
  };
}

/**
 * Verifies the enveloped signature of `xml` against `certificatePem` the way an SP does: the signature is taken from the
 * document itself, so a document whose assertion was altered after signing fails on the reference digest.
 */
export function verifySamlSignature(xml: string, certificatePem: string): boolean {
  const signatureXml = /<(?:[\w.-]+:)?Signature\b[\s\S]*?<\/(?:[\w.-]+:)?Signature>/.exec(xml)?.[0];
  if (!signatureXml) throw new SamlSpError('the document carries no signature');
  const signature = new SignedXml({ publicCert: certificatePem });
  signature.loadSignature(signatureXml);
  return signature.checkSignature(xml);
}

/** Every signing certificate the IdP metadata publishes, as PEM, in document order. */
export function idpSigningCertificates(metadataXml: string): string[] {
  const pattern = /<(?:[\w.-]+:)?X509Certificate>([^<]+)<\/(?:[\w.-]+:)?X509Certificate>/g;
  return [...metadataXml.matchAll(pattern)].map(match => certificateToPem(match[1] as string));
}

/** The `Location` of the metadata's HTTP-Redirect single-sign-on service. */
export function idpSsoLocation(metadataXml: string): string {
  return attributeValue(openingTag(metadataXml, 'SingleSignOnService'), 'Location');
}
