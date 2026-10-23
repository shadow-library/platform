import { useState } from 'react';
import { Button, Dialog, FormField, Input, Select, Switch, Textarea, toast } from '@shadow-library/ui';

import { useCreateScopeMutation } from '@/lib/apis';
import styles from '@/features/console/console.module.css';

export function AddScopeDialog(props: {
  resourceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createScope: ReturnType<typeof useCreateScopeMutation>;
}): React.JSX.Element {
  const { resourceId, open, onOpenChange, createScope } = props;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sensitive, setSensitive] = useState(false);
  const [principalType, setPrincipalType] = useState<'USER' | 'SERVICE' | 'BOTH'>('BOTH');

  const submit = (): void => {
    if (!name.trim()) return;
    createScope.mutate(
      { resourceId, body: { name: name.trim(), description: description.trim() || undefined, isSensitive: sensitive, principalType } },
      {
        onSuccess: () => {
          toast.success('Scope added');
          onOpenChange(false);
          setName('');
          setDescription('');
          setSensitive(false);
          setPrincipalType('BOTH');
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm">
        <Dialog.Header title="Add scope" description="Sensitive scopes mint only into a stepped-up (AAL2) token and stand out on the consent screen." />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Scope name" required>
              <Input value={name} onValueChange={setName} placeholder="read:orders" autoFocus />
            </FormField>
            <FormField label="Description">
              <Textarea value={description} onValueChange={setDescription} minRows={2} placeholder="Read a customer’s orders" />
            </FormField>
            <FormField label="Who may hold it" helper="Service scopes never reach a user token or the consent screen; user scopes never reach a service token.">
              <Select value={principalType} onValueChange={value => setPrincipalType(value as 'USER' | 'SERVICE' | 'BOTH')}>
                <Select.Item value="BOTH">Users and services</Select.Item>
                <Select.Item value="USER">Users only</Select.Item>
                <Select.Item value="SERVICE">Services only (M2M)</Select.Item>
              </Select>
            </FormField>
            <Switch
              label="Sensitive"
              description="Requires step-up (AAL2) and is highlighted on the consent screen."
              checked={sensitive}
              onCheckedChange={value => setSensitive(value === true)}
            />
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={createScope.isPending} onClick={submit}>
            Add scope
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
