'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiUrl } from '@/lib/api-url';
import { clientBasePath, withBasePath } from '@/lib/base-path';

function ChannelLinkForm() {
  const token = useSearchParams().get('token') || '';
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

  async function completeLink() {
    setPending(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/channel-links/complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ token }),
      });
      if (response.status === 401) {
        const basePath = clientBasePath();
        const callbackUrl = withBasePath(`/auth/channel-link?token=${encodeURIComponent(token)}`, basePath);
        window.location.assign(`${withBasePath('/auth/login', basePath)}?callbackUrl=${encodeURIComponent(callbackUrl)}`);
        return;
      }
      if (!response.ok) throw new Error(response.status === 409 ? 'This channel is already connected to another account.' : 'This link is invalid or has expired.');
      setComplete(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to connect this channel.');
    } finally {
      setPending(false);
    }
  }

  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return <p role="alert">This link is invalid or has expired.</p>;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <section className="glass-panel w-full space-y-5 rounded-3xl p-8">
        <h1 className="text-2xl font-bold">Connect this WhatsApp channel</h1>
        {complete ? (
          <p role="status">The channel is connected to your account.</p>
        ) : (
          <>
            <p>Continue only if you want to connect the WhatsApp conversation that opened this page to the account you are signed in to.</p>
            <p>This action does not grant access to another tenant or to private records by itself.</p>
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <button type="button" onClick={completeLink} disabled={pending}
              className="h-12 w-full rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60">
              {pending ? 'Connecting…' : 'Confirm connection'}
            </button>
          </>
        )}
      </section>
    </main>
  );
}

export default function ChannelLinkPage() {
  return <Suspense fallback={<main className="min-h-screen" />}><ChannelLinkForm /></Suspense>;
}
