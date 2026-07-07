/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Stepper } from './Stepper';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Stepper',
  component: Stepper,
  parameters: { layout: 'padded' },
  args: { children: null },
} satisfies Meta<typeof Stepper>;

export default meta;

type Story = StoryObj<typeof meta>;

function Panel({ children }: { children: string }) {
  return (
    <div style={{ minHeight: 120, padding: 16, background: 'var(--sh-surface-well)', borderRadius: 8 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{children}</h2>
    </div>
  );
}

export const Horizontal: Story = {
  render: () => {
    const [step, setStep] = useState(0);
    return (
      <Stepper current={step} onCurrentChange={setStep}>
        <Stepper.Step id='account' label='Account' hint='Sign-in details'>
          <Panel>Account</Panel>
        </Stepper.Step>
        <Stepper.Step id='team' label='Invite team' optional>
          <Panel>Invite team</Panel>
        </Stepper.Step>
        <Stepper.Step id='billing' label='Billing'>
          <Panel>Billing</Panel>
        </Stepper.Step>
        <Stepper.Step id='review' label='Review'>
          <Panel>Review &amp; finish</Panel>
        </Stepper.Step>
      </Stepper>
    );
  },
};

export const Vertical: Story = {
  render: () => {
    const [step, setStep] = useState(1);
    return (
      <Stepper current={step} onCurrentChange={setStep} orientation='vertical'>
        <Stepper.Step id='source' label='Source'>
          <Panel>Source</Panel>
        </Stepper.Step>
        <Stepper.Step id='mapping' label='Field mapping'>
          <Panel>Field mapping</Panel>
        </Stepper.Step>
        <Stepper.Step id='confirm' label='Confirm'>
          <Panel>Confirm import</Panel>
        </Stepper.Step>
      </Stepper>
    );
  },
};

export const AsyncValidation: Story = {
  render: () => {
    const [step, setStep] = useState(0);
    return (
      <Stepper current={step} onCurrentChange={setStep}>
        <Stepper.Step id='check' label='Availability' validate={() => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 900))}>
          <Panel>Continue runs an async check</Panel>
        </Stepper.Step>
        <Stepper.Step id='done' label='Done'>
          <Panel>Done</Panel>
        </Stepper.Step>
      </Stepper>
    );
  },
};
