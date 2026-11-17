'use client'

import { ChevronDown } from 'lucide-react'
import type { Role } from './data'
import { LEGAL_POLICY_VERSION, policiesForRole } from '@/lib/legal-policies'

export { policiesForRole }

const generalDrafts = [
  {
    title: 'Customer terms',
    body: 'LazyHand is a marketplace connecting customers with independent neighborhood shops and delivery partners. Product availability, descriptions, prices and fulfilment are provided by the relevant shop. Orders are confirmed only after LazyHand or the shop acknowledges them. Do not use the service for unlawful purchases or provide another person’s personal information without permission. These draft terms are governed by Indian law, subject to mandatory consumer rights and the jurisdiction of competent Indian courts. Statutory rights are not waived.',
  },
  {
    title: 'Privacy notice',
    body: 'LazyHand may process your name, verified phone number, delivery address, order details, support messages and device or diagnostic information to operate accounts, match local services, fulfil orders, prevent misuse and provide support. Share precise location only when you choose to enable it. Information is shared with the shop and delivery partner only as needed to fulfil an order, and with service providers acting for LazyHand. We do not sell personal information. You may request access, correction or deletion, subject to legal retention requirements, through LazyHand’s in-app support channel. This draft is intended to be reviewed against the Digital Personal Data Protection Act, 2023 and rules in force before launch.',
  },
  {
    title: 'Cancellation, returns and refunds',
    body: 'Cancellation is available only while an order has not entered fulfilment, where the app provides that option. For damaged, incorrect, missing or materially misdescribed items, contact support promptly with the order number and relevant details. Perishable goods may have different return handling, but this does not limit remedies required by Indian consumer law. Any refund method and timing will be confirmed in the app after the issue is reviewed. Cash-on-delivery orders are not treated as prepaid, and no screenshot or message alone proves a digital payment.',
  },
]

const sellerDrafts = [
  {
    title: 'Seller marketplace terms',
    body: 'A seller must provide accurate business, product, price, stock, tax and fulfilment information; hold required licences; comply with applicable food, weights-and-measures, consumer-protection and tax laws; and promptly honour accepted orders. Sellers must not list prohibited, counterfeit, unsafe or misleading goods, manipulate reviews, or misuse customer details. LazyHand may pause listings or accounts for safety, legal compliance or unresolved order issues, with a fair review process. Fees, settlements and payout timing are only those disclosed in the product or a separately signed agreement; a dashboard estimate is not a guaranteed payout.',
  },
]

const riderDrafts = [
  {
    title: 'Delivery partner terms',
    body: 'Delivery partners must keep contact, vehicle and account details accurate, use a roadworthy vehicle and required permits, follow traffic and safety laws, protect customer information, and handle orders and collected cash with care. Do not retain, redirect or privately collect payments outside the order instructions. Trip offers, distance and earnings are estimates unless expressly confirmed. Partner classification, insurance and other statutory obligations require review against the actual operating model and applicable Indian law before launch.',
  },
  {
    title: 'Safety and conduct',
    body: 'Never accept a delivery that appears unsafe or unlawful. Do not drive while using a handheld device, carry prohibited items, discriminate, harass, threaten or disclose a customer’s address or phone number. Report accidents, damaged goods, cash discrepancies and suspected fraud through support as soon as practicable. Emergency services should be contacted first when anyone faces immediate danger.',
  },
]

export function PolicyDraftDisclosure({ role }: { role: Role }) {
  const drafts = role === 'shopkeeper' ? [...generalDrafts.slice(0, 2), ...sellerDrafts, generalDrafts[2]] : role === 'rider' ? [...generalDrafts.slice(0, 2), ...riderDrafts, generalDrafts[2]] : generalDrafts

  return (
    <details className="group rounded-xl border border-line bg-white p-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span>Terms, privacy &amp; account policies</span>
        <span className="flex shrink-0 items-center gap-2">
          <ChevronDown aria-hidden="true" className="size-4 text-muted-ink transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
        <p className="text-[11px] leading-5 text-muted-ink">Version {LEGAL_POLICY_VERSION}. These India-focused drafts need local legal review before launch.</p>
        {drafts.map(draft => <section key={draft.title}><h3 className="text-xs font-bold">{draft.title}</h3><p className="mt-1 text-xs leading-5 text-muted-ink">{draft.body}</p></section>)}
      </div>
    </details>
  )
}
