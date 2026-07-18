/**
 * Importing npm packages
 */
import { type ReactElement, useState } from 'react';
import { Button, FormField, Input, Select } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { AuthShell } from '../components/auth-shell';
import { DeadFlow, FlowStep } from '../components/flow-step';
import { OtpStep } from '../components/otp-step';
import { api } from '../lib/api';
import { deviceId, safeReturnTo } from '../lib/context';
import { navigate } from '../lib/router';
import { useFlow } from '../lib/use-flow';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const GENDER_OPTIONS = [
  { value: 'UNSPECIFIED', label: 'Prefer not to say' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'OTHER', label: 'Other' },
];

const STEP_ORDER = ['IDENTIFIER', 'AWAITING_EMAIL_OTP', 'AWAITING_DEMOGRAPHICS', 'AWAITING_PROFILE', 'AWAITING_PASSWORD_SET'];

export function RegisterPage(): ReactElement {
  const { flow, busy, error, dead, run, reset, setError } = useFlow();
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('UNSPECIFIED');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const status = flow?.status ?? 'IDENTIFIER';
  const stepNumber = Math.max(STEP_ORDER.indexOf(status), 0) + 1;

  const complete = (state: { status: string } | null): void => {
    if (state?.status === 'COMPLETED') window.location.assign(safeReturnTo() ?? '/account');
  };

  const submitEmail = async (): Promise<void> => {
    if (!email.includes('@')) return setError('Enter a valid email address.');
    await run(() => api.registerInit(email.trim(), deviceId()));
  };

  const submitOtp = async (code: string): Promise<void> => {
    if (!flow) return;
    await run(() => api.challengeVerify(flow.flowId, { code }));
  };

  const submitDemographics = async (): Promise<void> => {
    if (!flow) return;
    if (!dateOfBirth) return setError('Enter your date of birth.');
    await run(() => api.registerDemographics(flow.flowId, dateOfBirth, gender));
  };

  const submitProfile = async (): Promise<void> => {
    if (!flow) return;
    if (!firstName.trim()) return setError('Enter your first name.');
    await run(() => api.registerProfile(flow.flowId, firstName.trim(), lastName.trim()));
  };

  const submitPassword = async (): Promise<void> => {
    if (!flow) return;
    if (password.length < 8) return setError('Choose a password of at least 8 characters.');
    if (password !== confirm) return setError('The passwords do not match.');
    complete(await run(() => api.registerPassword(flow.flowId, password)));
  };

  const subtitle = status === 'IDENTIFIER' ? 'One account for every shadow-apps.com service.' : `Step ${stepNumber} of ${STEP_ORDER.length}`;

  const renderStep = (): ReactElement => {
    if (dead) return <DeadFlow onRestart={reset} />;

    if (status === 'IDENTIFIER')
      return (
        <FlowStep title="Create your account" subtitle={subtitle} error={error} busy={busy} submitLabel="Continue" onSubmit={() => void submitEmail()} footer={signInHint()}>
          <FormField label="Email" helper="We'll send a verification code to this address.">
            <Input type="email" autoComplete="email" value={email} onValueChange={setEmail} autoFocus placeholder="you@example.com" />
          </FormField>
        </FlowStep>
      );

    if (status === 'AWAITING_EMAIL_OTP')
      return (
        <FlowStep title="Verify your email" subtitle={subtitle} error={error} busy={busy}>
          <OtpStep flowId={flow?.flowId ?? ''} method="EMAIL_OTP" maskedTarget={flow?.metadata?.maskedEmail} busy={busy} onSubmit={code => void submitOtp(code)} />
        </FlowStep>
      );

    if (status === 'AWAITING_DEMOGRAPHICS')
      return (
        <FlowStep title="About you" subtitle={subtitle} error={error} busy={busy} submitLabel="Continue" onSubmit={() => void submitDemographics()}>
          <FormField label="Date of birth">
            <Input type="date" autoComplete="bday" value={dateOfBirth} onValueChange={setDateOfBirth} autoFocus />
          </FormField>
          <FormField label="Gender" optional>
            <Select value={gender} onValueChange={value => setGender(value)} aria-label="Gender">
              {GENDER_OPTIONS.map(option => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select>
          </FormField>
        </FlowStep>
      );

    if (status === 'AWAITING_PROFILE')
      return (
        <FlowStep title="Your name" subtitle={subtitle} error={error} busy={busy} submitLabel="Continue" onSubmit={() => void submitProfile()}>
          <FormField label="First name">
            <Input type="text" autoComplete="given-name" value={firstName} onValueChange={setFirstName} autoFocus />
          </FormField>
          <FormField label="Last name" optional>
            <Input type="text" autoComplete="family-name" value={lastName} onValueChange={setLastName} />
          </FormField>
        </FlowStep>
      );

    if (status === 'AWAITING_PASSWORD_SET')
      return (
        <FlowStep title="Secure your account" subtitle={subtitle} error={error} busy={busy} submitLabel="Create account" onSubmit={() => void submitPassword()}>
          <FormField label="Password" helper="At least 8 characters. Breached and reused passwords are rejected.">
            <Input type="password" autoComplete="new-password" value={password} onValueChange={setPassword} autoFocus />
          </FormField>
          <FormField label="Confirm password">
            <Input type="password" autoComplete="new-password" value={confirm} onValueChange={setConfirm} />
          </FormField>
        </FlowStep>
      );

    return <DeadFlow onRestart={reset} />;
  };

  const signInHint = (): ReactElement => (
    <p className="text-secondary center-x gap-8">
      Already have an account?
      <Button variant="text" size="sm" type="button" onClick={() => navigate('/login')}>
        Sign in
      </Button>
    </p>
  );

  return <AuthShell>{renderStep()}</AuthShell>;
}
