'use client';

import { Suspense, useEffect, useState } from 'react';
import { useAppRouter } from '@/components/app-base-path';
import { apiUrl } from '@/lib/api-url';
import { clientBasePath, withBasePath } from '@/lib/base-path';

const storageKey = 'wa-akg-channel-link-token';

function getInitialToken() {
  if (typeof window === 'undefined') return '';
  const fromFragment = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  if (fromFragment) return fromFragment;
  try { return sessionStorage.getItem(storageKey) || ''; }
  catch { return ''; }
}

function ChannelLinkForm() {
  const [token] = useState(getInitialToken);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const router = useAppRouter();

  useEffect(() => {
    if (token) {
      try { sessionStorage.setItem(storageKey, token); }
      catch { /* The link can still be completed in this page if storage is disabled. */ }
    }
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [token]);

  async function completeLink() {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setError('This link is invalid or has expired.');
      return;
    }
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
        try { sessionStorage.setItem(storageKey, token); }
        catch {
          setError('This browser cannot preserve the link while signing in. Enable session storage and reopen the WhatsApp link.');
          return;
        }
        const basePath = clientBasePath();
        const callbackUrl = withBasePath('/auth/channel-link', basePath);
        router.push(`${withBasePath('/auth/login', basePath)}?callbackUrl=${encodeURIComponent(callbackUrl)}`);
        return;
      }
      if (!response.ok) throw new Error(response.status === 409 ? 'This channel is already connected to another account.' : 'This link is invalid or has expired.');
      try { sessionStorage.removeItem(storageKey); } catch { /* Ignore storage cleanup failures. */ }
      setComplete(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to connect this channel.');
    } finally {
      setPending(false);
    }
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
