import { useState } from 'react';
import { api } from '../api';
import { useApp } from '../state';
import { Icons } from './icons';
import { useToast } from './ui';

/** Starts the one-time 7-day Pro trial. Renders nothing once the account can't start one. */
export function TrialButton({ className = 'btn btn-primary' }: { className?: string }) {
  const { me, refresh } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!me.account.canTrial) return null;
  const start = async () => {
    setBusy(true);
    try {
      await api('/billing/trial', { body: {} });
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className={className} onClick={start} disabled={busy}>
      <Icons.sparkle size={15} /> {busy ? 'Starting…' : 'Try Pro free for 7 days'}
    </button>
  );
}
