/**
 * Importing npm packages
 */
import { Badge, Button, Card, Dialog, FormField, Input, OtpInput } from '@shadow-library/ui';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */
import { type ContactItem, api } from '../../lib/api';

/**
 * Defining types
 */

type ContactKind = 'email' | 'phone';

interface VerificationState {
  kind: ContactKind;
  verificationId: string;
  value: string;
}

/**
 * Declaring the constants
 *
 * Adding an identifier answers identically whether or not it exists elsewhere (D-12), so the
 * dialog copy never confirms anything beyond "a code was sent if the address is reachable".
 */

export function ContactsSection(): ReactElement {
  const [emails, setEmails] = useState<ContactItem[] | null>(null);
  const [phones, setPhones] = useState<ContactItem[] | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setEmails(await api.listEmails().catch(() => []));
    setPhones(await api.listPhones().catch(() => []));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async (kind: ContactKind): Promise<void> => {
    setNotice(null);
    const value = kind === 'email' ? newEmail.trim() : newPhone.trim();
    if (!value) return;
    const verificationId = await (kind === 'email' ? api.addEmail(value) : api.addPhone(value)).catch(() => null);
    if (!verificationId) return setNotice('The identifier could not be added right now.');
    setVerifyCode('');
    setVerifyError(null);
    setVerification({ kind, verificationId, value });
  };

  const verify = async (code: string): Promise<void> => {
    if (!verification) return;
    const action = verification.kind === 'email' ? api.verifyEmail(verification.verificationId, code) : api.verifyPhone(verification.verificationId, code);
    const success = await action.then(
      () => true,
      () => false,
    );
    if (!success) {
      setVerifyCode('');
      setVerifyError('That code was not accepted.');
      return;
    }
    setVerification(null);
    setNewEmail('');
    setNewPhone('');
    await refresh();
  };

  const setPrimary = async (kind: ContactKind, value: string): Promise<void> => {
    setNotice(null);
    await (kind === 'email' ? api.setPrimaryEmail(value) : api.setPrimaryPhone(value)).catch(() => setNotice('Only verified identifiers can become primary.'));
    await refresh();
  };

  const remove = async (kind: ContactKind, value: string): Promise<void> => {
    setNotice(null);
    await (kind === 'email' ? api.removeEmail(value) : api.removePhone(value)).catch(() => setNotice('The primary identifier cannot be removed.'));
    await refresh();
  };

  const renderList = (kind: ContactKind, items: ContactItem[] | null): ReactElement => {
    if (items === null) return <p className="text-secondary">Loading…</p>;
    if (items.length === 0) return <p className="text-secondary">None yet.</p>;
    return (
      <ul className="stack gap-8">
        {items.map(item => (
          <li key={item.value} className="flex items-center justify-between gap-16">
            <span className="cluster gap-8">
              <span>{item.value}</span>
              {item.isPrimary ? <Badge intent="info">Primary</Badge> : null}
              {item.verifiedAt ? <Badge intent="success">Verified</Badge> : <Badge intent="warning">Unverified</Badge>}
            </span>
            <span className="cluster gap-4">
              {!item.isPrimary && item.verifiedAt ? (
                <Button variant="ghost" size="sm" onClick={() => void setPrimary(kind, item.value)}>
                  Make primary
                </Button>
              ) : null}
              {!item.isPrimary ? (
                <Button variant="ghost" size="sm" onClick={() => void remove(kind, item.value)}>
                  Remove
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="stack gap-24">
      {notice ? <p className="text-secondary">{notice}</p> : null}
      <Card>
        <Card.Header title="Email addresses" />
        <Card.Body>
          <div className="stack gap-16">
            {renderList('email', emails)}
            <form
              className="cluster gap-8"
              onSubmit={event => {
                event.preventDefault();
                void add('email');
              }}
            >
              <Input size="sm" type="email" placeholder="new@example.com" value={newEmail} onValueChange={setNewEmail} aria-label="New email address" />
              <Button variant="secondary" size="sm" type="submit">
                Add email
              </Button>
            </form>
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header title="Phone numbers" />
        <Card.Body>
          <div className="stack gap-16">
            {renderList('phone', phones)}
            <form
              className="cluster gap-8"
              onSubmit={event => {
                event.preventDefault();
                void add('phone');
              }}
            >
              <Input size="sm" type="tel" placeholder="+15551234567" value={newPhone} onValueChange={setNewPhone} aria-label="New phone number" />
              <Button variant="secondary" size="sm" type="submit">
                Add phone
              </Button>
            </form>
          </div>
        </Card.Body>
      </Card>

      <Dialog open={verification !== null} onOpenChange={open => (open ? undefined : setVerification(null))}>
        <Dialog.Content size="sm">
          <Dialog.Header title="Verify ownership" description={`If ${verification?.value ?? 'the identifier'} is reachable, a 6-digit code is on its way.`} />
          <Dialog.Body>
            <FormField label="6-digit code" error={verifyError}>
              <OtpInput length={6} type="numeric" value={verifyCode} onValueChange={setVerifyCode} onComplete={code => void verify(code)} autoFocus />
            </FormField>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog>
    </div>
  );
}
