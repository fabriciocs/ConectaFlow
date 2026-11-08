'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import Link from '@/components/app-link';
import { BrandMark } from '@/components/auth/brand-mark';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiUrl } from '@/lib/api-url';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(false);
    try {
      const response = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) throw new Error('unavailable');
      setSent(true);
    } catch {
      setError(true);
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
          <h1 className="text-3xl font-bold">{t('recovery.title')}</h1>
          <p className="text-muted-foreground">{t('recovery.description')}</p>
        </div>
        <div className="glass-panel space-y-5 rounded-3xl p-8">
          {sent ? (
            <p role="status" className="text-sm">{t('recovery.sent')}</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <label htmlFor="recovery-email" className="block text-sm font-medium">{t('email')}</label>
              <Input id="recovery-email" type="email" autoComplete="email" required maxLength={254}
                value={email} onChange={(event) => setEmail(event.target.value)}
                placeholder={t('emailPlaceholder')} className="h-12" />
              {error && <p role="alert" className="text-sm text-destructive">{t('recovery.unavailable')}</p>}
              <Button className="h-12 w-full" type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('recovery.send')}
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
