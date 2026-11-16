'use client'

import { useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  ChevronRight,
  Compass,
  Hand,
  Heart,
  LocateFixed,
  MapPin,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Store,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type Screen = 'welcome' | 'location' | 'role' | 'discover' | 'orders' | 'profile'
type Role = 'Customer' | 'Shopkeeper' | 'Delivery partner'

const roles: { title: Role; description: string; Icon: typeof Store }[] = [
  { title: 'Customer', description: 'Explore nearby shops and place local orders.', Icon: ShoppingBasket },
  { title: 'Shopkeeper', description: 'Register your shop and prepare to receive orders.', Icon: Store },
  { title: 'Delivery partner', description: 'Apply to deliver neighborhood orders.', Icon: Bike },
]

export default function LazyHandWebApp() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [role, setRole] = useState<Role>('Customer')
  const [pin, setPin] = useState('')
  const [area, setArea] = useState('')
  const [notice, setNotice] = useState('')

  const go = (next: Screen) => {
    setNotice('')
    setScreen(next)
  }

  const continueToRole = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    go('role')
  }

  if (screen === 'welcome') {
    return (
      <main className="min-h-svh bg-[#fbf8f3] px-5 py-6 text-[#252c37] sm:px-10 sm:py-8">
        <div className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-6xl flex-col">
          <header className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#c2410c] text-white shadow-sm"><Hand size={22} strokeWidth={2.3} /></span>
            <span className="text-xl font-black tracking-[-0.06em]">LazyHand</span>
          </header>
          <section className="grid flex-1 items-center gap-8 py-10 md:grid-cols-[1.05fr_.95fr] md:gap-14 md:py-14">
            <div className="order-2 max-w-xl md:order-1">
              <p className="mb-4 text-xs font-extrabold uppercase tracking-[0.2em] text-[#9a3412]">Your local shops, a little closer</p>
              <h1 className="max-w-lg text-5xl font-black leading-[0.98] tracking-[-0.065em] sm:text-6xl md:text-7xl">Good things are around the corner.</h1>
              <p className="mt-5 max-w-md text-base leading-7 text-[#727984] sm:text-lg">Discover independent shops in the LazyHand pilot area. Your neighborhood, on your terms.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button onClick={() => go('location')} className="h-13 rounded-2xl bg-[#c2410c] px-6 text-sm font-bold text-white shadow-[0_12px_28px_-16px_#c2410c] hover:bg-[#9a3412]">
                  Set my location <ArrowRight data-icon="inline-end" />
                </Button>
                <span className="inline-flex items-center gap-2 px-1 text-xs text-[#727984]"><ShieldCheck size={15} /> Location is only requested when you choose to share it.</span>
              </div>
            </div>
            <div className="order-1 flex min-h-[290px] items-center justify-center overflow-hidden rounded-[2rem] bg-[#f3e8d7] md:order-2 md:min-h-[460px]">
              <div className="relative grid size-56 place-items-center rounded-full border border-[#d7c8b2] bg-[#f8f1e7] sm:size-72">
                <div className="absolute -left-4 top-12 grid size-14 place-items-center rounded-2xl bg-[#eaa950] text-[#252c37] shadow-lg sm:size-16"><Heart size={25} fill="currentColor" /></div>
                <div className="grid size-32 place-items-center rounded-[2.5rem] bg-white text-[#c2410c] shadow-[0_24px_70px_-28px_#6d3b1e] sm:size-40"><ShoppingBasket size={58} strokeWidth={1.5} /></div>
                <div className="absolute -right-3 bottom-10 grid size-14 place-items-center rounded-2xl bg-[#c2410c] text-white shadow-lg sm:size-16"><Store size={24} /></div>
                <span className="absolute right-12 top-6 size-3 rounded-full bg-[#eaa950]" />
                <span className="absolute bottom-8 left-10 size-2 rounded-full bg-[#9a3412]" />
              </div>
            </div>
          </section>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ece6de] pt-5 text-xs text-[#727984]">
            <span>Made for the neighborhood.</span><span className="inline-flex items-center gap-1.5"><MapPin size={13} /> Pilot area · PIN 845420</span>
          </footer>
        </div>
      </main>
    )
  }

  if (screen === 'location') {
    return (
      <main className="min-h-svh bg-[#fbf8f3] px-5 py-6 text-[#252c37] sm:px-10">
        <div className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-2xl flex-col">
          <header className="flex items-center gap-3"><Button variant="outline" size="icon" aria-label="Back to welcome" onClick={() => go('welcome')} className="size-10 rounded-xl bg-white"><ArrowLeft /></Button><span className="font-bold">Your neighborhood</span></header>
          <form onSubmit={continueToRole} className="my-auto py-10">
            <div className="mb-6 grid size-16 place-items-center rounded-[1.35rem] bg-[#f97316] text-white"><LocateFixed size={30} /></div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#9a3412]">A better local experience starts here</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] sm:text-5xl">Start with your location.</h1>
            <p className="mt-4 max-w-xl leading-7 text-[#727984]">The pilot PIN is 845420. A PIN covers a wider area than our 6 km delivery range, so coverage is not confirmed until the shop hub is set.</p>
            <div className="mt-8 grid gap-5 rounded-3xl border border-[#ece6de] bg-white p-5 sm:p-7">
              <label className="grid gap-2 text-sm font-bold" htmlFor="pin">PIN code
                <input id="pin" inputMode="numeric" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} placeholder="Enter your 6-digit PIN code" className="h-12 rounded-xl border border-[#e8e0d7] bg-[#fffdfa] px-4 font-normal outline-none transition focus:border-[#c2410c] focus:ring-4 focus:ring-[#c2410c]/10" />
              </label>
              <label className="grid gap-2 text-sm font-bold" htmlFor="area">Area or landmark <span className="font-normal text-[#727984]">(optional)</span>
                <input id="area" value={area} onChange={event => setArea(event.target.value)} placeholder="Apartment, street or landmark" className="h-12 rounded-xl border border-[#e8e0d7] bg-[#fffdfa] px-4 font-normal outline-none transition focus:border-[#c2410c] focus:ring-4 focus:ring-[#c2410c]/10" />
              </label>
              <div className="flex gap-3 rounded-2xl bg-[#fff3e7] p-4 text-sm leading-6 text-[#59351f]"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#9a3412]" /><p>Precise location is used only when checking service coverage. This web preview does not request device location.</p></div>
              <Button type="submit" className="h-12 rounded-xl bg-[#c2410c] font-bold text-white hover:bg-[#9a3412]">Continue <ArrowRight data-icon="inline-end" /></Button>
            </div>
          </form>
        </div>
      </main>
    )
  }

  if (screen === 'role') {
    return (
      <main className="min-h-svh bg-[#fbf8f3] px-5 py-6 text-[#252c37] sm:px-10">
        <div className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-2xl flex-col">
          <header className="flex items-center gap-3"><Button variant="outline" size="icon" aria-label="Back to location" onClick={() => go('location')} className="size-10 rounded-xl bg-white"><ArrowLeft /></Button><span className="font-bold">Choose your path</span></header>
          <section className="my-auto py-10">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#9a3412]">Made for your neighborhood</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] sm:text-5xl">How will you use LazyHand?</h1>
            <p className="mt-4 leading-7 text-[#727984]">Pick a starting role. Shop and rider applications require separate review before going live.</p>
            <div className="mt-8 grid gap-3" role="radiogroup" aria-label="Choose your role">
              {roles.map(({ title, description, Icon }) => <button key={title} type="button" role="radio" aria-checked={role === title} onClick={() => setRole(title)} className={`flex min-h-20 items-center gap-4 rounded-2xl border p-4 text-left transition ${role === title ? 'border-[#c2410c] bg-[#fff0e2] ring-2 ring-[#c2410c]/10' : 'border-[#ece6de] bg-white hover:border-[#d7c8b2]'}`}><span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${role === title ? 'bg-[#f97316] text-white' : 'bg-[#fff7ee] text-[#9a3412]'}`}><Icon size={23} /></span><span className="min-w-0 flex-1"><span className="block font-extrabold">{title}</span><span className="mt-1 block text-sm leading-5 text-[#727984]">{description}</span></span><span className={`grid size-6 place-items-center rounded-full border ${role === title ? 'border-[#c2410c] bg-[#c2410c] text-white' : 'border-[#c9c3bb] text-transparent'}`}><Check size={14} /></span></button>)}
            </div>
            <Button onClick={() => role === 'Customer' ? go('discover') : setNotice('Applications will be available when account and review services are connected.')} className="mt-6 h-12 w-full rounded-xl bg-[#c2410c] font-bold text-white hover:bg-[#9a3412]">{role === 'Customer' ? 'Explore LazyHand' : role === 'Shopkeeper' ? 'Register a shop' : 'Apply as a rider'} <ArrowRight data-icon="inline-end" /></Button>
            {notice && <p role="status" className="mt-4 rounded-xl bg-[#fff0e2] p-3 text-sm text-[#59351f]">{notice}</p>}
          </section>
        </div>
      </main>
    )
  }

  const navItems: { title: string; screen: Screen; Icon: typeof Compass }[] = [
    { title: 'Discover', screen: 'discover', Icon: Compass },
    { title: 'Orders', screen: 'orders', Icon: PackageCheck },
    { title: 'Profile', screen: 'profile', Icon: UserRound },
  ]

  return (
    <main className="min-h-svh bg-[#fbf8f3] px-4 pb-28 pt-5 text-[#252c37] sm:px-8 sm:pt-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <button onClick={() => go('discover')} className="flex items-center gap-2.5 rounded-lg text-left" aria-label="LazyHand home"><span className="grid size-10 place-items-center rounded-xl bg-[#c2410c] text-white"><Hand size={20} /></span><span className="text-lg font-black tracking-[-0.06em]">LazyHand</span></button>
          <button onClick={() => go('location')} className="flex min-w-0 items-center gap-2 rounded-xl border border-[#ece6de] bg-white px-3 py-2 text-left"><MapPin size={17} className="shrink-0 text-[#c2410c]" /><span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-widest text-[#727984]">Your area</span><span className="block truncate text-xs font-bold">{pin || 'Set location to check availability'}</span></span><ChevronRight size={16} className="shrink-0 text-[#c2410c]" /></button>
        </header>

        {screen === 'discover' && <>
          <section className="relative mt-5 overflow-hidden rounded-[1.8rem] bg-[#c2410c] p-6 text-white sm:mt-8 sm:min-h-[300px] sm:p-10">
            <div className="absolute -right-12 -top-16 grid size-56 place-items-center rounded-full bg-[#f97316] sm:size-80"><div className="grid size-28 rotate-[-8deg] place-items-center rounded-[2rem] bg-[#ffb84a] text-[#252c37] sm:size-36"><Store className="size-14 sm:size-16" /></div></div>
            <div className="relative max-w-lg"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ffdfc8]">Small shops. Big heart.</p><h1 className="mt-3 max-w-md text-3xl font-black leading-[1.02] tracking-[-0.055em] sm:text-5xl">Your neighborhood, on your terms.</h1><p className="mt-3 max-w-sm text-sm leading-6 text-[#fff0e2]">Discover local shops when the LazyHand pilot opens in your area.</p><span className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-[9px] font-black tracking-wide"><span className="size-2 rounded-full bg-[#95d5a3]" /> PILOT PIN 845420 · COVERAGE CHECK REQUIRED</span></div>
          </section>
          <section className="mt-7"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-black tracking-tight">Around your corner</h2><p className="mt-1 text-xs text-[#727984]">Independent shops, when available</p></div><Search size={18} className="mb-1 text-[#9a3412]" /></div><div className="rounded-3xl border border-[#ece6de] bg-white px-5 py-8 text-center sm:px-8"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#fff0e2] text-[#9a3412]"><Store size={26} /></span><h3 className="mt-4 font-black">No shops listed yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#727984]">We removed sample shops and products. Registered shops will appear here after approval and catalog setup.</p><Button variant="outline" onClick={() => setNotice('Shop registration will be available when account and review services are connected.')} className="mt-4 h-10 rounded-xl border-[#e8d5c3] text-[#9a3412]">Register a shop <ArrowRight data-icon="inline-end" /></Button>{notice && <p role="status" className="mt-3 text-xs text-[#727984]">{notice}</p>}</div></section>
          <section className="mt-6"><h2 className="mb-3 text-lg font-black tracking-tight">Your way to help</h2><button onClick={() => { setRole('Delivery partner'); setNotice('Delivery partner applications require review and are not submitted from this preview.') }} className="flex w-full items-center gap-3 rounded-2xl border border-[#ece6de] bg-white p-4 text-left"><span className="grid size-11 place-items-center rounded-xl bg-[#fff0e2] text-[#9a3412]"><Bike size={22} /></span><span className="flex-1"><span className="block text-sm font-extrabold">Deliver close to home</span><span className="mt-1 block text-xs text-[#727984]">Apply to become a delivery partner</span></span><ChevronRight size={18} className="text-[#9a3412]" /></button>{notice && <p className="mt-2 text-xs text-[#727984]">{notice}</p>}</section>
        </>}
        {screen === 'orders' && <section className="mx-auto mt-20 max-w-xl text-center"><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-[#fff0e2] text-[#9a3412]"><PackageCheck size={30} /></span><h1 className="mt-5 text-3xl font-black tracking-tight">Your next order starts nearby.</h1><p className="mt-3 text-sm leading-6 text-[#727984]">There are no orders on this account yet. Order history needs account sign-in and the live backend.</p><Button onClick={() => go('discover')} className="mt-6 h-11 rounded-xl bg-[#c2410c] text-white hover:bg-[#9a3412]">Explore shops <ArrowRight data-icon="inline-end" /></Button></section>}
        {screen === 'profile' && <section className="mx-auto mt-8 max-w-2xl"><h1 className="text-3xl font-black tracking-tight">Your profile</h1><div className="mt-5 rounded-3xl bg-[#fff0e2] p-5"><div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-2xl bg-[#f97316] text-[#252c37]"><UserRound size={27} /></span><div><h2 className="font-black">Welcome to LazyHand</h2><p className="mt-1 text-sm text-[#727984]">Sign-in is required to save addresses and orders.</p></div></div></div><h2 className="mb-2 mt-7 text-xs font-black uppercase tracking-[0.15em] text-[#727984]">Account</h2>{[['Phone sign-in', 'OTP provider not configured'], ['Delivery address', pin || 'Add your location'], ['Notifications', 'Off']].map(([title, detail]) => <div key={title} className="flex items-center justify-between border-b border-[#ece6de] py-4"><div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs text-[#727984]">{detail}</p></div><ChevronRight size={17} className="text-[#727984]" /></div>)}</section>}
      </div>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-10 border-t border-[#ece6de] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur"><div className="mx-auto flex max-w-lg items-center justify-around">{navItems.map(({ title, screen: destination, Icon }) => <button key={title} aria-current={screen === destination ? 'page' : undefined} onClick={() => go(destination)} className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-2 text-[10px] font-bold ${screen === destination ? 'text-[#c2410c]' : 'text-[#727984]'}`}><Icon size={20} strokeWidth={screen === destination ? 2.5 : 1.8} />{title}</button>)}</div></nav>
    </main>
  )
}
