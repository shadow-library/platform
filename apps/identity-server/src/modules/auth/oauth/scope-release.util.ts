export type AssuranceLevel = 'AAL1' | 'AAL2';

/** A sensitive scope is minted only into an AAL2 token; consenting to it at authorize is not enough to carry it. */
export function isReleasableAt(scope: { isSensitive: boolean }, aal: AssuranceLevel): boolean {
  return !scope.isSensitive || aal === 'AAL2';
}
