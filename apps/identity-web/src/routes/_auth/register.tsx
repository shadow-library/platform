/**
 * Importing npm packages
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, Button, FormField, Input, Select } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { CheckIcon } from '@/components/icons';
import { AuthCard, AuthMedallion, AuthScreen, OtpEntry, StepHeader, StepProgress, useFlow } from '@/features/auth';
import parts from '@/features/auth/auth-parts.module.css';
import { authApi, type FlowState } from '@/lib/apis';
import { useDeviceId } from '@/lib/hooks';

/**
 * Declaring the constants
 */
interface RegisterSearch {
  returnTo?: string;
  client?: string;
}

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNSPECIFIED', label: 'Prefer not to say' },
];

const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: 'At least 12 characters', test: value => value.length >= 12 },
  { label: 'Upper and lowercase letters', test: value => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: 'A number', test: value => /\d/.test(value) },
  { label: 'A symbol (recommended)', test: value => /[^A-Za-z0-9]/.test(value) },
];

export const Route = createFileRoute('/_auth/register')({
  validateSearch: (search: Record<string, unknown>): RegisterSearch => ({
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
    client: typeof search.client === 'string' ? search.client : undefined,
  }),
  component: RegisterPage,
});

function RegisterPage(): React.JSX.Element {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const { flow, busy, error, dead, run, reset, setError } = useFlow();

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  const complete = (next: FlowState): void => {
    if (next.resumeUrl) return window.location.assign(next.resumeUrl);
    if (search.returnTo && search.returnTo.startsWith('/')) return window.location.assign(search.returnTo);
    navigate({ to: '/account' });
  };

  const footer = (
    <span>
      Already have an account? <Link to="/login">Sign in</Link>
    </span>
  );

  if (dead)
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <StepHeader title="Sign-up couldn’t be completed" description="That session expired before we finished. Start again to create your account." align="center" />
          <Button variant="primary" fullWidth onClick={reset}>
            Start over
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  /* ---------- step 1: email ---------- */
  if (!flow)
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <StepProgress total={4} current={1} label="Step 1 of 4 · Account" />
          <StepHeader
            title="Create your account"
            description={
              search.client ? (
                <>
                  Join <strong>{search.client}</strong> with a Shadow account.
                </>
              ) : (
                'Sign up with a Shadow account.'
              )
            }
          />
          {error && (
            <Alert intent="danger" title="We couldn’t continue">
              {error}
            </Alert>
          )}
          <FormField label="Email address">
            <Input type="email" placeholder="you@company.com" autoComplete="email" value={email} onValueChange={setEmail} autoFocus />
          </FormField>
          <Button
            variant="primary"
            fullWidth
            loading={busy}
            onClick={() => (email.trim() ? void run(() => authApi.registerInit(email.trim(), deviceId)) : setError('Enter your email address.'))}
          >
            Continue
          </Button>
          <p className={parts.otpNote}>By continuing you agree to the Terms and Privacy Policy.</p>
        </AuthCard>
      </AuthScreen>
    );

  const status = flow.status;
  const stepIndex = status === 'AWAITING_EMAIL_OTP' ? 2 : status === 'AWAITING_DEMOGRAPHICS' || status === 'AWAITING_PROFILE' ? 3 : 4;

  if (status === 'COMPLETED')
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <AuthMedallion intent="success">
            <CheckIcon size={30} strokeWidth={2.4} />
          </AuthMedallion>
          <StepHeader title="You’re all set" description="Your Shadow account is ready. We recommend adding a second factor next." align="center" />
          <Button variant="primary" fullWidth onClick={() => complete(flow)}>
            Continue
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  /* ---------- step 2: verify email ---------- */
  if (status === 'AWAITING_EMAIL_OTP')
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <StepProgress total={4} current={stepIndex} label="Step 2 of 4 · Verify" />
          <OtpEntry
            title="Verify your email"
            sentTo={flow.metadata?.maskedEmail ?? email}
            value={otp}
            error={error}
            onValueChange={setOtp}
            onComplete={code => void run(() => authApi.challengeVerify(flow.flowId, { code }))}
            note="If this email already has an account, we’ll help you sign in instead."
          />
        </AuthCard>
      </AuthScreen>
    );

  /* ---------- step 3: profile ---------- */
  if (status === 'AWAITING_DEMOGRAPHICS' || status === 'AWAITING_PROFILE') {
    const submitProfile = (): void => {
      if (!firstName.trim() || !lastName.trim()) return setError('Enter your first and last name.');
      void run(async () => {
        if (flow.status === 'AWAITING_DEMOGRAPHICS') await authApi.registerDemographics(flow.flowId, dateOfBirth, gender);
        return authApi.registerProfile(flow.flowId, firstName.trim(), lastName.trim());
      });
    };
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <StepProgress total={4} current={stepIndex} label="Step 3 of 4 · Profile" />
          <StepHeader title="Tell us about you" description="This appears on your account." />
          {error && (
            <Alert intent="danger" title="Check your details">
              {error}
            </Alert>
          )}
          <div className={parts.nameRow}>
            <FormField label="First name" required>
              <Input value={firstName} onValueChange={setFirstName} autoFocus />
            </FormField>
            <FormField label="Last name" required>
              <Input value={lastName} onValueChange={setLastName} />
            </FormField>
          </div>
          <FormField label="Date of birth" optional>
            <Input type="date" value={dateOfBirth} onValueChange={setDateOfBirth} />
          </FormField>
          <FormField label="Gender" optional>
            <Select placeholder="Prefer not to say" value={gender} onValueChange={setGender}>
              {GENDERS.map(option => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select>
          </FormField>
          <Button variant="primary" fullWidth loading={busy} onClick={submitProfile}>
            Continue
          </Button>
        </AuthCard>
      </AuthScreen>
    );
  }

  /* ---------- step 4: password ---------- */
  return (
    <AuthScreen footer={footer}>
      <AuthCard>
        <StepProgress total={4} current={stepIndex} label="Step 4 of 4 · Password" />
        <StepHeader title="Set a password" description="Make it strong — you’ll use it to sign in." />
        {error && (
          <Alert intent="danger" title="That didn’t work">
            {error}
          </Alert>
        )}
        <FormField label="Password">
          <Input type="password" revealable autoComplete="new-password" value={password} onValueChange={setPassword} autoFocus />
        </FormField>
        <div className={parts.pwRules}>
          {PASSWORD_RULES.map(rule => {
            const ok = rule.test(password);
            return (
              <div key={rule.label} className={parts.pwRule} data-ok={ok || undefined}>
                {ok ? <CheckIcon size={14} strokeWidth={3} /> : <span className={parts.pwDot} />}
                {rule.label}
              </div>
            );
          })}
        </div>
        <Button
          variant="primary"
          fullWidth
          loading={busy}
          onClick={() => (password ? void run(() => authApi.registerPassword(flow.flowId, password)) : setError('Choose a password.'))}
        >
          Create account
        </Button>
      </AuthCard>
    </AuthScreen>
  );
}
