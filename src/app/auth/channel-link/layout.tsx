import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Connect WhatsApp channel',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ChannelLinkLayout({ children }: { children: ReactNode }) {
  return children;
}
