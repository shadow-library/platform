import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Button } from '@shadow-library/ui';

import { StatusPage } from './StatusPage';

export default function NotFound(): ReactElement {
  return (
    <StatusPage
      title="Page not found"
      description="That page doesn't exist or has moved. Everything you've logged is where you left it."
      actions={
        <Button variant="primary" asChild>
          <Link to="/">Back to today</Link>
        </Button>
      }
    />
  );
}
