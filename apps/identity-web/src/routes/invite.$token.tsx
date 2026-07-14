/**
 * Importing npm packages
 */
import { Avatar, Button } from '@shadow-library/ui';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { CheckIcon, MailIcon, MinusIcon } from '@/components/icons';
import { AuthCard, AuthMedallion, AuthScreen, StepHeader } from '@/features/auth';
import parts from '@/features/auth/auth-parts.module.css';
import { meQueryOptions, useAcceptInvitationMutation, useDeclineInvitationMutation, useMeQuery } from '@/lib/apis';
import { displayName } from '@/lib/format';

/**
 * The organisation-invite landing, reached from an email link. The server exposes no invitation
 * preview (neutrality, D-12), so the organisation's name only appears after acceptance — before that
 * the page adapts purely to whether a session exists for the invited address.
 */
export const Route = createFileRoute('/invite/$token')({
  // Prefetch the session so the invite SSRs its signed-in / signed-out branch directly; a missing session
  // is a valid state here (the recipient signs in first), so a 401 is swallowed rather than redirected.
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQueryOptions());
    } catch {
      /* signed-out invite landing is expected */
    }
  },
  component: InvitePage,
});

function InvitePage(): React.JSX.Element {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const me = useMeQuery();
  const accept = useAcceptInvitationMutation();
  const decline = useDeclineInvitationMutation();

  const footer = (
    <span>
      Need help? <a href="mailto:support@shadow-apps.com">Contact support</a>
    </span>
  );

  if (accept.isSuccess)
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <AuthMedallion intent="success">
            <CheckIcon size={28} strokeWidth={2.2} />
          </AuthMedallion>
          <StepHeader title={`You’ve joined ${accept.data.name}`} description="The organization is ready whenever you are." align="center" />
          <Button variant="primary" fullWidth onClick={() => navigate({ to: '/organizations/$orgId', params: { orgId: accept.data.id } })}>
            Go to {accept.data.name}
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  if (decline.isSuccess)
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <AuthMedallion intent="neutral">
            <MinusIcon size={27} />
          </AuthMedallion>
          <StepHeader title="Invitation declined" description="We’ve let the organization know you won’t be joining. You can safely close this page." align="center" />
          <Button variant="secondary" fullWidth asChild>
            <Link to="/account">Back to Shadow Identity</Link>
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  const failed = accept.isError || decline.isError;
  if (failed)
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <AuthMedallion intent="warning">
            <MailIcon size={28} />
          </AuthMedallion>
          <StepHeader
            title="This invitation isn’t valid"
            description="It may have expired, already been used, been withdrawn, or been sent to a different address than the one you’re signed in as."
            align="center"
          />
          <Button variant="secondary" fullWidth asChild>
            <Link to="/account">Back to Shadow Identity</Link>
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  // Signed out — the recipient must hold the invited address verified, so route them through auth first.
  if (me.isError || (!me.isLoading && !me.data))
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <div className={parts.inviteHead}>
            <Avatar name="Organization invite" shape="square" size="xl" icon={<MailIcon size={24} />} />
            <div className={parts.inviteEyebrow}>You’ve been invited to join an organization</div>
            <h1 className={parts.inviteOrg}>Shadow Identity</h1>
          </div>
          <div className={parts.inviteBanner} data-intent="neutral">
            <MailIcon size={17} />
            <span>To accept, sign in or create an account for the address this invite was sent to — you’ll return here automatically once it’s verified.</span>
          </div>
          <div className={parts.btnStack}>
            <Button variant="primary" fullWidth asChild>
              <Link to="/register" search={{ returnTo: `/invite/${token}` }}>
                Create account &amp; continue
              </Link>
            </Button>
            <Button variant="secondary" fullWidth asChild>
              <Link to="/login" search={{ returnTo: `/invite/${token}` }}>
                I already have an account
              </Link>
            </Button>
          </div>
        </AuthCard>
      </AuthScreen>
    );

  // Signed in — offer to accept or decline the invitation bound to this address.
  return (
    <AuthScreen footer={footer}>
      <AuthCard>
        <div className={parts.inviteHead}>
          <Avatar name="Organization invite" shape="square" size="xl" icon={<MailIcon size={24} />} />
          <div className={parts.inviteEyebrow}>You’ve been invited to join an organization</div>
          <h1 className={parts.inviteOrg}>Accept your invitation</h1>
        </div>
        {me.data && (
          <div className={parts.inviteBanner} data-intent="success">
            <CheckIcon size={17} strokeWidth={2.2} />
            <span>
              Signed in as <strong>{me.data.email ?? displayName(me.data)}</strong>. The invitation must match this address.
            </span>
          </div>
        )}
        <div className={parts.btnStack}>
          <Button variant="primary" fullWidth loading={accept.isPending} onClick={() => accept.mutate(token)}>
            Accept invitation
          </Button>
          <Button variant="ghost" fullWidth loading={decline.isPending} onClick={() => decline.mutate(token)}>
            Decline
          </Button>
        </div>
      </AuthCard>
    </AuthScreen>
  );
}
