'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import Link from '@/components/app-link';
import { BrandMark } from '@/components/auth/brand-mark';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiUrl } from '@/lib/api-url';

function ResetPasswordForm() {
  const t = useTranslations('auth');
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) { setError(t('register.passwordMismatch')); return; }
    if (password.length < 6 || password.length > 128) { setError(t('recovery.invalidPassword')); return; }
    if (!token) { setError(t('recovery.invalidLink')); return; }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (response.status === 400) { setError(t('recovery.invalidLink')); return; }
      if (!response.ok) throw new Error('unavailable');
      setComplete(true);
    } catch {
      setError(t('recovery.unavailable'));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <BrandMark />
          <h1 className="text-3xl font-bold">{t('recovery.resetTitle')}</h1>
        </div>
        <div className="glass-panel space-y-5 rounded-3xl p-8">
          {complete ? (
            <p role="status" className="text-sm">{t('recovery.completed')}</p>
          ) : !token ? (
            <p role="alert" className="text-sm text-destructive">{t('recovery.invalidLink')}</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <label htmlFor="new-password" className="block text-sm font-medium">{t('recovery.newPassword')}</label>
              <Input id="new-password" type="password" required minLength={6} maxLength={128}
                autoComplete="new-password" value={password}
                onChange={(event) => setPassword(event.target.value)} className="h-12" />
              <label htmlFor="confirm-new-password" className="block text-sm font-medium">{t('register.confirmPassword')}</label>
              <Input id="confirm-new-password" type="password" required minLength={6} maxLength={128}
                autoComplete="new-password" value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)} className="h-12" />
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button className="h-12 w-full" type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('recovery.reset')}
              </Button>
            </form>
          )}
          <div className="text-center text-sm">
            <Link href="/auth/login" className="font-semibold text-primary hover:underline">{t('recovery.backToLogin')}</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="min-h-screen bg-background" />}>
    <ResetPasswordForm />
  </Suspense>;
}
