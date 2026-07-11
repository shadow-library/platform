/**
 * Importing npm packages
 */
import { Alert, Button, Card } from '@shadow-library/ui';
import { type FormEvent, type ReactElement, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

interface StepProps {
  title: string;
  subtitle?: ReactNode;
  error?: string | null;
  busy?: boolean;
  submitLabel?: string;
  onSubmit?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}

interface DeadFlowProps {
  onRestart: () => void;
}

/**
 * Declaring the constants
 */

/** One flow step: heading, staggered-reveal body, single primary action, quiet footer links. */
export function FlowStep({ title, subtitle, error, busy, submitLabel, onSubmit, children, footer }: StepProps): ReactElement {
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit?.();
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card.Header title={title} />
      <Card.Body>
        <div className="auth-step stack gap-16">
          {subtitle ? <p className="text-secondary">{subtitle}</p> : null}
          {error ? <Alert intent="danger" title={error} /> : null}
          {children}
          {submitLabel ? (
            <Button type="submit" variant="primary" fullWidth loading={busy} size="lg">
              {submitLabel}
            </Button>
          ) : null}
        </div>
      </Card.Body>
      {footer ? <Card.Footer>{footer}</Card.Footer> : null}
    </form>
  );
}

/** Terminal state for expired/terminated flows — the only exit is a clean restart. */
export function DeadFlow({ onRestart }: DeadFlowProps): ReactElement {
  return (
    <FlowStep title="This attempt has expired" subtitle="For your security the session step timed out. Start again — it only takes a moment.">
      <Button variant="primary" fullWidth onClick={onRestart}>
        Start over
      </Button>
    </FlowStep>
  );
}
