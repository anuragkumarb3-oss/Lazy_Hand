'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Bike,
  Check,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  ShoppingBasket,
  Store,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from './data'
import { BackButton, Field, Logo, PrimaryButton, Screen, SecondaryButton } from './ui'

export type LocationState = {
  status: 'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'
  area: string
  message: string
}

export type Profile = {
  name: string
  phone: string
  village: string
  landmark: string
  role: Role
  shopName: string
  shopType: string
  vehicle: string
}

const PHONE_RE = /^[6-9]\d{9}$/

export function validatePhone(phone: string) {
  if (!phone) return 'Enter your mobile number'
  if (!PHONE_RE.test(phone)) return 'Enter a valid 10-digit Indian mobile number'
  return ''
}

export function WelcomeScreen({ onStart, onLogin, onShopkeeperUnlock }: { onStart: () => void; onLogin: () => void; onShopkeeperUnlock: () => void }) {
  const [logoTaps, setLogoTaps] = useState(0)
  const [shopkeeperUnlocked, setShopkeeperUnlocked] = useState(false)

  const tapLogo = () => {
    if (shopkeeperUnlocked) return
    const next = logoTaps + 1
    setLogoTaps(next)
    if (next >= 10) {
      setShopkeeperUnlocked(true)
      onShopkeeperUnlock()
    }
  }

  return (
    <main className="min-h-svh bg-gradient-to-b from-[#F76B1C] via-[#FA8A2E] to-[#FFB24A] text-white">
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-[max(env(safe-area-inset-top),24px)]">
        <section className="flex flex-1 flex-col items-center justify-center text-center">
          <button
            type="button"
            onClick={tapLogo}
            aria-label="LazyHand logo. Tap ten times to unlock shopkeeper signup"
            className="w-64 rounded-[28px] border border-white/80 bg-white px-4 py-5 shadow-[0_24px_48px_-24px_#7C2D12]"
          >
            <Logo priority className="w-full" />
          </button>
          {shopkeeperUnlocked && <p role="status" className="mt-3 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium">Shopkeeper signup unlocked</p>}
          <h1 className="mt-7 text-4xl font-bold tracking-tight text-balance">LazyHand</h1>
          <p className="mt-2 max-w-64 text-sm leading-6 text-white/90 text-pretty">Your neighborhood shops, delivered to your door.</p>
        </section>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onStart}
            className="h-12 w-full rounded-xl bg-white text-sm font-semibold text-brand-deep shadow-sm transition active:scale-[0.99]"
          >
            Get Started
          </button>
          <button type="button" onClick={onLogin} className="min-h-10 text-sm text-white/95">
            Already have an account? <span className="font-semibold underline underline-offset-4">Log in</span>
          </button>
        </div>
      </div>
    </main>
  )
}

export function LocationScreen({ location, onRetry, onContinue, onBack }: { location: LocationState; onRetry: () => void; onContinue: () => void; onBack: () => void }) {
  const granted = location.status === 'granted'
  const failed = location.status === 'denied' || location.status === 'unavailable'
  return (
    <Screen className="px-5 pb-6 pt-[max(env(safe-area-inset-top),20px)]">
      <header className="flex items-center">
        <BackButton onClick={onBack} />
      </header>
      <section className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <OrbitAnimation active={!failed} done={granted} />
        <h1 className="mt-10 text-3xl font-bold tracking-tight text-balance">
          {granted ? 'Found you!' : failed ? 'Location is off' : 'Finding shops near you'}
        </h1>
        <p className="mt-3 max-w-72 text-sm leading-6 text-muted-ink text-pretty">
          {granted
            ? 'We detected your area automatically. Shops below deliver here.'
            : failed
              ? location.message
              : 'Allow location when your browser asks. We detect your area automatically — no PIN code needed.'}
        </p>

        <div aria-live="polite" className="mt-7 flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', granted ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-peach text-brand-deep')}>
            {granted ? <Check className="size-5" aria-hidden="true" /> : <MapPin className="size-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-ink">{granted ? 'Delivering to' : 'Your location'}</p>
            <p className="truncate text-sm font-semibold">
              {granted ? location.area : location.status === 'loading' ? 'Detecting…' : failed ? 'Not available' : 'Waiting for permission'}
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        {granted ? (
          <PrimaryButton onClick={onContinue}>Continue</PrimaryButton>
        ) : (
          <>
            <PrimaryButton onClick={onRetry} disabled={location.status === 'loading'}>
              <LocateFixed className="size-4" aria-hidden="true" />
              {location.status === 'loading' ? 'Detecting your location…' : 'Allow location access'}
            </PrimaryButton>
            <button type="button" onClick={onContinue} className="min-h-10 text-sm text-muted-ink">
              Skip for now
            </button>
          </>
        )}
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-ink">
          <ShieldCheck className="size-3.5" aria-hidden="true" /> Used only to show shops that deliver to you
        </p>
      </div>
    </Screen>
  )
}

function OrbitAnimation({ active, done }: { active: boolean; done: boolean }) {
  const orbiters = [
    { Icon: Store, ring: 'inset-0', duration: '9s', reverse: false },
    { Icon: Bike, ring: 'inset-6', duration: '6s', reverse: true },
    { Icon: ShoppingBasket, ring: 'inset-12', duration: '4.5s', reverse: false },
  ]
  return (
    <div className="relative size-60" aria-hidden="true">
      {orbiters.map(({ Icon, ring, duration, reverse }) => (
        <div
          key={ring}
          className={cn('absolute rounded-full border border-dashed border-[#F3C9A6] motion-reduce:!animate-none', ring)}
          style={{ animation: `lh-orbit ${duration} linear infinite ${reverse ? 'reverse' : 'normal'}`, animationPlayState: active ? 'running' : 'paused' }}
        >
          <span
            className="absolute left-1/2 top-0 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-brand-deep shadow-sm"
            style={{ animation: `lh-orbit ${duration} linear infinite ${reverse ? 'normal' : 'reverse'}`, animationPlayState: active ? 'running' : 'paused' }}
          >
            <Icon className="size-4" />
          </span>
        </div>
      ))}
      <div className="absolute inset-0 grid place-items-center">
        {active && !done && <span className="absolute size-20 rounded-full bg-brand/30 motion-reduce:hidden" style={{ animation: 'lh-ping 1.6s ease-out infinite' }} />}
        <span className={cn('relative grid size-16 place-items-center rounded-full text-white shadow-[0_12px_28px_-12px_#9A3412] transition-colors', done ? 'bg-[#16A34A]' : 'bg-brand')}>
          {done ? <Check className="size-7" /> : <Navigation className="size-7 fill-white" />}
        </span>
      </div>
    </div>
  )
}

export function LoginScreen({ onSendOtp, onGuest, onSignup, onBack }: { onSendOtp: (phone: string) => void; onGuest: () => void; onSignup: () => void; onBack: () => void }) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const problem = validatePhone(phone)
    setError(problem)
    if (!problem) onSendOtp(phone)
  }

  return (
    <Screen className="px-5 pb-6 pt-[max(env(safe-area-inset-top),20px)]">
      <header>
        <BackButton onClick={onBack} />
      </header>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm leading-6 text-muted-ink">This preview does not send SMS. Use any 4 digits to try the demo, or continue as a guest.</p>
      <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
        <Field
          id="login-phone"
          label="Mobile number"
          Icon={Phone}
          prefix="+91"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          maxLength={10}
          value={phone}
          onChange={e => {
            setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
            if (error) setError('')
          }}
          error={error}
        />
        <PrimaryButton type="submit">Send OTP</PrimaryButton>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-ink">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <SecondaryButton onClick={onGuest}>Continue as guest</SecondaryButton>
      <p className="mt-auto pt-8 text-center text-sm text-muted-ink">
        New to LazyHand?{' '}
        <button type="button" onClick={onSignup} className="font-semibold text-brand-deep">
          Create account
        </button>
      </p>
    </Screen>
  )
}

export function OtpScreen({ phone, onVerified, onBack }: { phone: string; onVerified: () => void; onBack: () => void }) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  const verify = (code: string[]) => {
    if (code.some(d => d === '')) {
      setError('Enter all 4 digits')
      return
    }
    onVerified()
  }

  const setDigit = (index: number, raw: string) => {
    const incoming = raw.replace(/\D/g, '')
    const next = [...digits]
    if (incoming.length > 1) {
      incoming.slice(0, 4 - index).split('').forEach((d, i) => (next[index + i] = d))
    } else {
      next[index] = incoming
    }
    setDigits(next)
    setError('')
    const firstEmpty = next.findIndex(d => d === '')
    if (firstEmpty === -1) verify(next)
    else if (incoming) refs.current[Math.min(firstEmpty, 3)]?.focus()
  }

  return (
    <Screen className="px-5 pb-6 pt-[max(env(safe-area-inset-top),20px)]">
      <header>
        <BackButton onClick={onBack} />
      </header>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Try the sign-in demo</h1>
      <p className="mt-2 text-sm text-muted-ink">No SMS is sent in this preview. Enter any 4 digits to continue with +91 {phone.slice(0, 5)} {phone.slice(5)}.</p>
      <form
        noValidate
        onSubmit={e => {
          e.preventDefault()
          verify(digits)
        }}
        className="mt-7 flex flex-col gap-5"
      >
        <fieldset>
          <legend className="sr-only">One-time password</legend>
          <div className="flex justify-center gap-3">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={el => {
                  refs.current[index] = el
                }}
                value={digit}
                onChange={e => setDigit(index, e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus()
                }}
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                aria-label={`Digit ${index + 1}`}
                aria-invalid={Boolean(error)}
                className={cn(
                  'size-14 rounded-xl border bg-white text-center text-xl font-semibold outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20',
                  error ? 'border-[#DC2626]' : 'border-line',
                )}
              />
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-center text-xs text-[#DC2626]">{error}</p>}
        <PrimaryButton type="submit">Continue to demo</PrimaryButton>
      </form>
    </Screen>
  )
}

type SignupErrors = Partial<Record<keyof Profile, string>>

export function SignupScreen({ initial, onCreate, onLogin, onBack }: { initial: Profile; onCreate: (profile: Profile) => void; onLogin: () => void; onBack: () => void }) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<SignupErrors>({})

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: SignupErrors = {}
    if (form.name.trim().length < 2) next.name = 'Enter your full name'
    const phoneError = validatePhone(form.phone)
    if (phoneError) next.phone = phoneError
    if (!form.village.trim()) next.village = 'Enter your village, tola or ward'
    if (form.role === 'shopkeeper') {
      if (!form.shopName.trim()) next.shopName = 'Enter your shop name'
      if (!form.shopType) next.shopType = 'Choose what your shop sells'
    }
    if (form.role === 'rider' && !form.vehicle) next.vehicle = 'Choose your vehicle'
    setErrors(next)
    const firstInvalid = Object.keys(next)[0]
    if (firstInvalid) {
      const field = document.getElementById(`signup-${firstInvalid}`)
      const target = field?.getAttribute('role') === 'radiogroup'
        ? field.querySelector<HTMLElement>('[role="radio"]')
        : field
      target?.focus()
      return
    }
    onCreate({ ...form, name: form.name.trim(), village: form.village.trim(), landmark: form.landmark.trim(), shopName: form.shopName.trim() })
  }

  return (
    <Screen className="px-5 pb-6 pt-[max(env(safe-area-inset-top),20px)]">
      <header>
        <BackButton onClick={onBack} />
      </header>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-muted-ink">Tell us where to deliver — village accurate.</p>
      <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
        <Field id="signup-name" label="Full name" Icon={UserRound} autoComplete="name" placeholder="Ramesh Kumar" value={form.name} onChange={e => update('name', e.target.value)} error={errors.name} />
        <Field
          id="signup-phone"
          label="Mobile number"
          Icon={Phone}
          prefix="+91"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          maxLength={10}
          value={form.phone}
          onChange={e => update('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
          error={errors.phone}
        />
        <Field id="signup-village" label="Village / Tola / Ward" Icon={MapPin} autoComplete="address-level3" placeholder="Rampur, Ward 4" value={form.village} onChange={e => update('village', e.target.value)} error={errors.village} />
        <Field id="signup-landmark" label="Nearest landmark" optional Icon={Navigation} placeholder="Near Shiv Mandir" value={form.landmark} onChange={e => update('landmark', e.target.value)} />

        <div className="rounded-xl border border-line bg-[#FFF8F1] p-3 text-sm">
          <p className="font-semibold">{form.role === 'shopkeeper' ? 'Shopkeeper account' : 'Customer account'}</p>
          <p className="mt-1 text-xs leading-5 text-muted-ink">
            {form.role === 'shopkeeper' ? 'List your products and receive orders.' : 'Order groceries, dairy & snacks from nearby shops. You can add another role later.'}
          </p>
        </div>

        {form.role === 'shopkeeper' && (
          <>
            <Field id="signup-shopName" label="Shop name" Icon={Store} placeholder="Gupta Kirana Store" value={form.shopName} onChange={e => update('shopName', e.target.value)} error={errors.shopName} />
            <ChipGroup
              id="signup-shopType"
              label="Shop sells"
              options={['Kirana', 'Dairy', 'Vegetables', 'Sweets'].map(v => ({ value: v, label: v }))}
              value={form.shopType}
              onChange={v => update('shopType', v)}
              error={errors.shopType}
            />
          </>
        )}
        {form.role === 'rider' && (
          <ChipGroup
            id="signup-vehicle"
            label="Your vehicle"
            options={['Bicycle', 'Motorbike', 'Scooter'].map(v => ({ value: v, label: v }))}
            value={form.vehicle}
            onChange={v => update('vehicle', v)}
            error={errors.vehicle}
          />
        )}

        <PrimaryButton type="submit" className="mt-2">{form.role === 'shopkeeper' ? 'Create shopkeeper account' : 'Create customer account'}</PrimaryButton>
        <p className="text-center text-xs leading-5 text-muted-ink">
          Want to deliver for LazyHand? <a href="mailto:help@lazyhand.app?subject=Delivery%20partner%20request" className="font-semibold text-brand-deep underline underline-offset-2">Talk to support</a>
        </p>
        <p className="text-center text-[11px] leading-5 text-muted-ink">Fields marked Required are needed to set up your demo profile. Your delivery area helps show nearby shops. This preview does not save your details to an account.</p>
      </form>
      <p className="mt-6 text-center text-sm text-muted-ink">
        Already registered?{' '}
        <button type="button" onClick={onLogin} className="font-semibold text-brand-deep">
          Log in
        </button>
      </p>
    </Screen>
  )
}

function ChipGroup({ id, label, options, value, onChange, error }: { id: string; label: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; error?: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-medium text-muted-ink">
        {label}
        <span className="ml-1 font-semibold text-brand-deep">· Required</span>
      </legend>
      <div id={id} role="radiogroup" aria-label={label} aria-required="true" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="flex flex-wrap gap-2">
        {options.map(option => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              id={`${id}-${option.value}`}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onKeyDown={event => {
                const currentIndex = options.findIndex(item => item.value === value)
                const nextIndex = event.key === 'ArrowRight' || event.key === 'ArrowDown'
                  ? (currentIndex + 1) % options.length
                  : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                    ? (currentIndex - 1 + options.length) % options.length
                    : -1
                if (nextIndex >= 0) {
                  event.preventDefault()
                  onChange(options[nextIndex].value)
                  document.getElementById(`${id}-${options[nextIndex].value}`)?.focus()
                }
              }}
              onClick={() => onChange(option.value)}
              className={cn(
                'h-9 rounded-full border px-4 text-xs font-semibold transition active:scale-95',
                selected ? 'border-brand bg-brand text-white' : error ? 'border-[#DC2626] bg-white text-ink' : 'border-line bg-white text-ink',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {error && <p id={`${id}-error`} className="text-xs text-[#DC2626]">{error}</p>}
    </fieldset>
  )
}
