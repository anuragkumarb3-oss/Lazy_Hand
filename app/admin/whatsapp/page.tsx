import type { Metadata } from 'next'
import { WhatsAppAdmin } from '@/components/lazyhand/whatsapp-admin'

export const metadata: Metadata = { title: 'WhatsApp sender · LazyHand admin', robots: { index: false, follow: false } }

export default function AdminWhatsAppPage() {
  return <WhatsAppAdmin />
}
