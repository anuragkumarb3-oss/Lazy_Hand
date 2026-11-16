'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Carrot,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Cookie,
  Croissant,
  CupSoda,
  IceCreamCone,
  LocateFixed,
  MapPin,
  Milk,
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

const categories: { name: string; Icon: typeof Store; tone: string }[] = [
  { name: 'Chips & Namkeen', Icon: Cookie, tone: 'bg-[#fff0c9] text-[#ba5a11]' },
  { name: 'Drinks & Juices', Icon: CupSoda, tone: 'bg-[#e5f1ff] text-[#3676ca]' },
  { name: 'Bakery & Biscuits', Icon: Croissant, tone: 'bg-[#ffead5] text-[#b86a24]' },
  { name: 'Ice Cream & More', Icon: IceCreamCone, tone: 'bg-[#fde2ef] text-[#d64182]' },
  { name: 'Vegetables & Fruits', Icon: Carrot, tone: 'bg-[#e2f5e9] text-[#388659]' },
  { name: 'Dairy & Bread', Icon: Milk, tone: 'bg-[#e4edff] text-[#4078cc]' },
]

export default function LazyHandWebApp() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [role, setRole] = useState<Role>('Customer')
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'>('idle')
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null)
  const [locationMessage, setLocationMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [notice, setNotice] = useState('')

  const go = (next: Screen) => {
    setNotice('')
    setScreen(next)
  }

  const requestLocation = useCallback(() => {
    setLocationStatus('loading')
    setLocationMessage('Waiting for location permission…')
    if (!navigator.geolocation) {
      setLocationStatus('unavailable')
      setLocationMessage('Location services are not available in this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        setLocationAccuracy(Math.round(position.coords.accuracy))
        setLocationStatus('granted')
        setLocationMessage('Your current location has been detected on this device.')
      },
      error => {
        setLocationStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')
        setLocationMessage(error.code === error.PERMISSION_DENIED
          ? 'Location access is off. Allow location for this site in your browser settings, then try again.'
          : 'We couldn’t get a location fix. Check that device location is on and try again.')
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    )
  }, [])

  useEffect(() => {
    if (screen === 'location') requestLocation()
  }, [screen, requestLocation])

  if (screen === 'welcome') {
    return (
      <main className="min-h-svh bg-gradient-to-b from-[#f76d1f] via-[#fa842d] to-[#ffb84a] px-6 text-white">
        <div className="mx-auto flex min-h-svh w-full max-w-md flex-col pb-[max(env(safe-area-inset-bottom),24px)] pt-[max(env(safe-area-inset-top),24px)]">
          <section className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="grid size-32 place-items-center rounded-[2rem] bg-[#fffaf3] p-4 shadow-[0_18px_44px_-20px_#9a3412]">
              <Image src="/lazyhand-logo.png" alt="LazyHand hand-drawn logo" width={196} height={90} priority className="h-auto w-full object-contain" />
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-[-0.06em]">LazyHand</h1>
            <p className="mt-3 max-w-[18rem] text-sm leading-6 text-white/90">Your neighborhood, at your doorstep in 20 minutes.</p>
          </section>
          <div className="flex flex-col gap-4">
            <Button onClick={() => go('location')} className="h-14 w-full rounded-2xl bg-white text-sm font-extrabold text-[#e7611b] shadow-sm hover:bg-[#fff5e9]">
              Get started <ArrowRight data-icon="inline-end" />
            </Button>
            <button type="button" onClick={() => setNotice('Sign-in is not available in this preview yet.')} className="min-h-10 text-sm font-semibold text-white/95">Already have an account? <span className="font-black underline underline-offset-4">Log in</span></button>
            {notice && <p role="status" className="text-center text-xs text-white/90">{notice}</p>}
            <p className="text-center text-[11px] text-white/80">Location access is requested after you continue.</p>
          </div>
        </div>
      </main>
    )
  }

  if (screen === 'location') {
    return (
      <main className="min-h-svh bg-[#fbf8f3] px-5 py-5 text-[#252c37]">
        <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-md flex-col">
          <header className="flex items-center gap-3"><Button variant="outline" size="icon" aria-label="Back to welcome" onClick={() => go('welcome')} className="size-10 rounded-xl border-[#ece6de] bg-white"><ArrowLeft /></Button><span className="font-bold">Your neighborhood</span></header>
          <section className="my-auto py-8">
            <div aria-hidden="true" className="relative mb-7 grid size-24 place-items-center">
              <div className="absolute inset-0 animate-[spin_14s_linear_infinite] rounded-full border border-dashed border-[#d7b69b] motion-reduce:animate-none"><span className="absolute left-1/2 top-0 size-3 -translate-x-1/2 rounded-full bg-[#f97316] shadow-[0_0_0_5px_#fbf8f3]" /></div>
              <div className="absolute inset-3 animate-[spin_9s_linear_infinite_reverse] rounded-full border border-[#e8d8c7] motion-reduce:animate-none"><span className="absolute bottom-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-[#9a3412] shadow-[0_0_0_4px_#fbf8f3]" /></div>
              <div className="grid size-12 place-items-center rounded-2xl bg-[#f97316] text-white shadow-[0_10px_24px_-12px_#9a3412]"><LocateFixed size={23} /></div>
            </div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#9a3412]">Nearby, without the guesswork</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.055em]">Find shops around you.</h1>
            <p className="mt-4 leading-7 text-[#727984]">Allow location access and LazyHand will detect your current position automatically. No PIN code needed.</p>
            <div className="mt-7 rounded-3xl border border-[#ece6de] bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#fff0e2] text-[#c2410c]"><MapPin size={21} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold">{locationStatus === 'granted' ? 'Current location detected' : locationStatus === 'loading' ? 'Finding your location…' : 'Waiting for location access'}</p>
                  <p role="status" aria-live="polite" className="mt-1 text-xs leading-5 text-[#727984]">{locationMessage || 'Your browser will ask for permission when this screen opens.'}</p>
                  {locationStatus === 'granted' && locationAccuracy !== null && <p className="mt-1 text-xs font-semibold text-[#388659]">Approx. accuracy ±{locationAccuracy} m</p>}
                </div>
                {locationStatus === 'granted' && <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#e2f5e9] text-[#388659]"><Check size={15} /></span>}
              </div>
              {(locationStatus === 'denied' || locationStatus === 'unavailable') && <Button type="button" variant="outline" onClick={requestLocation} className="mt-4 h-10 w-full rounded-xl border-[#e8d5c3] font-bold text-[#9a3412]">Try location again <LocateFixed data-icon="inline-end" /></Button>}
            </div>
            <div className="mt-4 flex gap-3 rounded-2xl bg-[#fff3e7] p-4 text-xs leading-5 text-[#59351f]"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#9a3412]" /><p>Your coordinates stay on this device in this preview and are not saved to a server.</p></div>
          </section>
          <div className="flex flex-col gap-3 pb-2">
            {locationStatus === 'granted' ? <Button type="button" onClick={() => go('role')} className="h-12 w-full rounded-xl bg-[#f97316] font-bold text-white hover:bg-[#c2410c]">Continue <ArrowRight data-icon="inline-end" /></Button> : <>
              <Button type="button" onClick={requestLocation} disabled={locationStatus === 'loading'} className="h-12 w-full rounded-xl bg-[#f97316] font-bold text-white hover:bg-[#c2410c]">{locationStatus === 'loading' ? 'Waiting for permission…' : 'Try location again'} <LocateFixed data-icon="inline-end" /></Button>
              <button type="button" onClick={() => go('role')} className="min-h-10 text-xs font-semibold text-[#727984]">Continue without location</button>
            </>}
          </div>
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
    { title: 'Home', screen: 'discover', Icon: Compass },
    { title: 'Orders', screen: 'orders', Icon: PackageCheck },
    { title: 'Profile', screen: 'profile', Icon: UserRound },
  ]

  if (screen === 'discover') {
    return (
      <main className="min-h-svh bg-[#faf7f2] pb-24 text-[#252c37]">
        <header className="bg-gradient-to-br from-[#f97316] to-[#ffb84a] px-4 pb-5 pt-[max(env(safe-area-inset-top),16px)] text-white">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/80">Delivering to</p>
                <button type="button" onClick={() => go('location')} className="mt-1 flex min-h-8 max-w-full items-center gap-1.5 text-left text-sm font-extrabold" aria-label="Detect your current location">
                  <MapPin size={16} className="shrink-0" />
                  <span className="truncate">{locationStatus === 'granted' ? 'Current location' : 'Find nearby shops'}</span>
                  <ChevronDown size={16} className="shrink-0" />
                </button>
              </div>
              <span className="shrink-0 rounded-full bg-white/20 px-3 py-2 text-[10px] font-extrabold">LOCAL SHOPS</span>
            </div>
            <label className="mt-4 flex h-12 items-center gap-3 rounded-2xl bg-white px-4 text-[#727984] shadow-sm">
              <Search size={18} className="shrink-0" />
              <span className="sr-only">Search local shops and categories</span>
              <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} type="search" placeholder="Search milk, chips, bread" className="min-w-0 flex-1 bg-transparent text-sm text-[#252c37] outline-none placeholder:text-[#90959d]" />
            </label>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Quick categories">
              {['All', 'Snacks', 'Drinks', 'Bakery', 'Dairy'].map(category => <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition ${selectedCategory === category ? 'bg-white text-[#c2410c]' : 'bg-white/20 text-white'}`}>{category}</button>)}
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-4 pt-5">
          <section aria-labelledby="category-heading">
            <div className="mb-3 flex items-end justify-between">
              <div><h1 id="category-heading" className="text-lg font-black tracking-tight">Categories</h1><p className="mt-1 text-xs text-[#727984]">Find what you need from local shops</p></div>
              <button type="button" onClick={() => setSelectedCategory('All')} className="pb-0.5 text-xs font-bold text-[#c2410c]">See all</button>
            </div>
            <div className="grid grid-cols-3 gap-2.5 md:grid-cols-6">
              {categories.map(({ name, Icon, tone }) => <button key={name} type="button" aria-pressed={selectedCategory === name} onClick={() => setSelectedCategory(name)} className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border bg-white px-2 py-3 text-center transition ${selectedCategory === name ? 'border-[#f97316] ring-2 ring-[#f97316]/15' : 'border-[#eee8df]'}`}><span className={`grid size-12 place-items-center rounded-2xl ${tone}`}><Icon size={22} strokeWidth={1.8} /></span><span className="text-[10px] font-bold leading-4 text-[#343b45]">{name}</span></button>)}
            </div>
          </section>
          <section aria-labelledby="shops-heading" className="mt-7">
            <div className="flex items-end justify-between"><div><h2 id="shops-heading" className="text-lg font-black tracking-tight">Shops near you</h2><p className="mt-1 text-xs text-[#727984]">Local favorites, delivered nearby</p></div><span className="text-[10px] font-semibold text-[#727984]">15–20 min</span></div>
            <div className="mt-3 rounded-3xl border border-[#eee8df] bg-white p-5 sm:p-6">
              <span className="grid size-12 place-items-center rounded-2xl bg-[#fff0e2] text-[#c2410c]"><Store size={23} /></span>
              <h3 className="mt-4 text-sm font-black">More neighborhood shops are joining</h3>
              <p className="mt-2 max-w-md text-xs leading-5 text-[#727984]">We’ll show nearby stores here as soon as they’re available in your area.</p>
              {(searchQuery || selectedCategory !== 'All') && <p className="mt-3 rounded-xl bg-[#faf7f2] px-3 py-2 text-xs text-[#727984]">Showing {selectedCategory === 'All' ? 'all categories' : selectedCategory}{searchQuery ? ` matching “${searchQuery}”` : ''}.</p>}
            </div>
          </section>
        </div>
        <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 border-t border-[#eee8df] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center justify-around">{navItems.map(({ title, screen: destination, Icon }) => <button key={title} aria-current={screen === destination ? 'page' : undefined} onClick={() => go(destination)} className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-2 text-[10px] font-bold ${screen === destination ? 'text-[#c2410c]' : 'text-[#727984]'}`}><Icon size={20} strokeWidth={screen === destination ? 2.5 : 1.8} />{title}</button>)}</div>
        </nav>
      </main>
    )
  }

  return (
    <main className="min-h-svh bg-[#fbf8f3] px-4 pb-28 pt-5 text-[#252c37] sm:px-8 sm:pt-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <button onClick={() => go('discover')} className="rounded-lg text-left" aria-label="LazyHand home"><Image src="/lazyhand-logo.png" alt="LazyHand" width={148} height={68} className="h-auto w-32 object-contain" /></button>
          <button onClick={() => go('location')} className="flex min-w-0 items-center gap-2 rounded-xl border border-[#ece6de] bg-white px-3 py-2 text-left"><MapPin size={17} className="shrink-0 text-[#c2410c]" /><span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-widest text-[#727984]">Your area</span><span className="block truncate text-xs font-bold">{locationStatus === 'granted' ? 'Current location' : 'Detect automatically'}</span></span><ChevronRight size={16} className="shrink-0 text-[#c2410c]" /></button>
        </header>

        {screen === 'orders' && <section className="mx-auto mt-20 max-w-xl text-center"><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-[#fff0e2] text-[#9a3412]"><PackageCheck size={30} /></span><h1 className="mt-5 text-3xl font-black tracking-tight">Your next order starts nearby.</h1><p className="mt-3 text-sm leading-6 text-[#727984]">There are no orders on this account yet. Order history needs account sign-in and the live backend.</p><Button onClick={() => go('discover')} className="mt-6 h-11 rounded-xl bg-[#c2410c] text-white hover:bg-[#9a3412]">Explore shops <ArrowRight data-icon="inline-end" /></Button></section>}
        {screen === 'profile' && <section className="mx-auto mt-8 max-w-2xl"><h1 className="text-3xl font-black tracking-tight">Your profile</h1><div className="mt-5 rounded-3xl bg-[#fff0e2] p-5"><div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-2xl bg-[#f97316] text-[#252c37]"><UserRound size={27} /></span><div><h2 className="font-black">Welcome to LazyHand</h2><p className="mt-1 text-sm text-[#727984]">Sign-in is required to save addresses and orders.</p></div></div></div><h2 className="mb-2 mt-7 text-xs font-black uppercase tracking-[0.15em] text-[#727984]">Account</h2>{[['Phone sign-in', 'OTP provider not configured'], ['Delivery address', locationStatus === 'granted' ? 'Current location detected' : 'Location not shared'], ['Notifications', 'Off']].map(([title, detail]) => <div key={title} className="flex items-center justify-between border-b border-[#ece6de] py-4"><div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs text-[#727984]">{detail}</p></div><ChevronRight size={17} className="text-[#727984]" /></div>)}</section>}
      </div>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-10 border-t border-[#ece6de] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur"><div className="mx-auto flex max-w-lg items-center justify-around">{navItems.map(({ title, screen: destination, Icon }) => <button key={title} aria-current={screen === destination ? 'page' : undefined} onClick={() => go(destination)} className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-2 text-[10px] font-bold ${screen === destination ? 'text-[#c2410c]' : 'text-[#727984]'}`}><Icon size={20} strokeWidth={screen === destination ? 2.5 : 1.8} />{title}</button>)}</div></nav>
    </main>
  )
}
