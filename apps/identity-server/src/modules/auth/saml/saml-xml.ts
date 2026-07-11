/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

import { XMLParser } from 'fast-xml-parser';
import { SignedXml } from 'xml-crypto';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface ParsedAuthnRequest {
  id: string;
  issuer: string;
  acsUrl?: string;
}

export interface AssertionAttribute {
  name: string;
  value: string;
}

export interface BuildResponseParams {
  issuer: string;
  audience: string;
  acsUrl: string;
  inResponseTo: string;
  nameId: string;
  nameIdFormat: string;
  sessionIndex: string;
  attributes: AssertionAttribute[];
  privateKeyPem: string;
  certificatePem: string;
  validitySeconds: number;
}

/**
 * Declaring the constants
 *
 * All SAML documents this service SIGNS are constructed here from typed parameters — never echoed
 * from caller input — so the signing path never canonicalizes attacker-shaped XML. The only
 * untrusted XML parsed is the AuthnRequest, read with entity processing disabled (XXE-safe) and
 * only ever used for exact-match lookups; SP request signatures are NOT verified (hand-rolled
 * XML-DSIG verification is an XSW minefield), which is safe because nothing security-relevant is
 * taken from the request: the assertion always goes to the registered ACS URL.
 */
const NS_ASSERTION = 'urn:oasis:names:tc:SAML:2.0:assertion';
const NS_PROTOCOL = 'urn:oasis:names:tc:SAML:2.0:protocol';
const NAME_ID_FORMATS: Record<string, string> = {
  EMAIL: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  PERSISTENT: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
};
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false });

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function nameIdFormatUri(format: string): string {
  return NAME_ID_FORMATS[format] ?? (NAME_ID_FORMATS.EMAIL as string);
}

/** Redirect-binding SAMLRequest values are base64(raw-deflate(xml)); POST binding is plain base64. */
export function decodeSamlRequest(encoded: string): string | null {
  let raw: Buffer;
  try {
    raw = Buffer.from(encoded, 'base64');
  } catch {
    return null;
  }
  try {
    return inflateRawSync(raw).toString('utf-8');
  } catch {
    const text = raw.toString('utf-8');
    return text.includes('AuthnRequest') ? text : null;
  }
}

export function parseAuthnRequest(xml: string): ParsedAuthnRequest | null {
  let doc: Record<string, Record<string, string> | undefined>;
  try {
    doc = parser.parse(xml) as Record<string, Record<string, string> | undefined>;
  } catch {
    return null;
  }
  const request = doc['AuthnRequest'];
  if (!request) return null;
  const id = request['@_ID'];
  const issuer = typeof request['Issuer'] === 'object' ? (request['Issuer'] as Record<string, string>)['#text'] : request['Issuer'];
  if (typeof id !== 'string' || typeof issuer !== 'string' || !id || !issuer) return null;
  const acsUrl = request['@_AssertionConsumerServiceURL'];
  return { id, issuer, acsUrl: typeof acsUrl === 'string' ? acsUrl : undefined };
}

export function certificateToBase64(pem: string): string {
  return pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
}

/** Builds the samlp:Response with a signed saml:Assertion (enveloped RSA-SHA256, exclusive c14n). */
export function buildSignedResponse(params: BuildResponseParams): string {
  const now = new Date();
  const notOnOrAfter = new Date(now.getTime() + params.validitySeconds * 1000);
  const responseId = `_${randomUUID()}`;
  const assertionId = `_${randomUUID()}`;
  const issueInstant = now.toISOString();
  const issuer = escapeXml(params.issuer);
  const audience = escapeXml(params.audience);
  const acsUrl = escapeXml(params.acsUrl);
  const inResponseTo = escapeXml(params.inResponseTo);

  const attributes = params.attributes
    .map(
      attribute =>
        `<saml:Attribute Name="${escapeXml(attribute.name)}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">` +
        `<saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">${escapeXml(attribute.value)}</saml:AttributeValue>` +
        `</saml:Attribute>`,
    )
    .join('');
  const attributeStatement = attributes ? `<saml:AttributeStatement>${attributes}</saml:AttributeStatement>` : '';

  const assertion =
    `<saml:Assertion xmlns:saml="${NS_ASSERTION}" ID="${assertionId}" Version="2.0" IssueInstant="${issueInstant}">` +
    `<saml:Issuer>${issuer}</saml:Issuer>` +
    `<saml:Subject>` +
    `<saml:NameID Format="${nameIdFormatUri(params.nameIdFormat)}">${escapeXml(params.nameId)}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
    `<saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter.toISOString()}" Recipient="${acsUrl}" InResponseTo="${inResponseTo}"/>` +
    `</saml:SubjectConfirmation>` +
    `</saml:Subject>` +
    `<saml:Conditions NotBefore="${issueInstant}" NotOnOrAfter="${notOnOrAfter.toISOString()}">` +
    `<saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction>` +
    `</saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${issueInstant}" SessionIndex="${escapeXml(params.sessionIndex)}">` +
    `<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>` +
    `</saml:AuthnStatement>` +
    attributeStatement +
    `</saml:Assertion>`;

  const signer = new SignedXml({ privateKey: params.privateKeyPem, publicCert: params.certificatePem });
  signer.addReference({ xpath: "//*[local-name(.)='Assertion']", digestAlgorithm: SHA256, transforms: [ENVELOPED, EXC_C14N] });
  signer.signatureAlgorithm = RSA_SHA256;
  signer.canonicalizationAlgorithm = EXC_C14N;
  signer.computeSignature(assertion, { location: { reference: "//*[local-name(.)='Issuer']", action: 'after' } });
  const signedAssertion = signer.getSignedXml();

  return (
    `<samlp:Response xmlns:samlp="${NS_PROTOCOL}" xmlns:saml="${NS_ASSERTION}" ID="${responseId}" Version="2.0" IssueInstant="${issueInstant}" Destination="${acsUrl}" InResponseTo="${inResponseTo}">` +
    `<saml:Issuer>${issuer}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    signedAssertion +
    `</samlp:Response>`
  );
}

/** IdP metadata: entity id, signing certificates (active first), and the redirect-binding SSO endpoint. */
export function buildMetadata(entityId: string, ssoUrl: string, certificates: string[]): string {
  const keyDescriptors = certificates
    .map(
      pem =>
        `<md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
        `<ds:X509Data><ds:X509Certificate>${certificateToBase64(pem)}</ds:X509Certificate></ds:X509Data>` +
        `</ds:KeyInfo></md:KeyDescriptor>`,
    )
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${escapeXml(entityId)}">` +
    `<md:IDPSSODescriptor WantAuthnRequestsSigned="false" protocolSupportEnumeration="${NS_PROTOCOL}">` +
    keyDescriptors +
    `<md:NameIDFormat>${NAME_ID_FORMATS.EMAIL}</md:NameIDFormat>` +
    `<md:NameIDFormat>${NAME_ID_FORMATS.PERSISTENT}</md:NameIDFormat>` +
    `<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${escapeXml(ssoUrl)}"/>` +
    `</md:IDPSSODescriptor>` +
    `</md:EntityDescriptor>`
  );
}
