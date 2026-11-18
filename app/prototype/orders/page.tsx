import Link from 'next/link'
import { SellerOrderPrototype } from '@/components/lazyhand/partners'

export default function SellerOrderPrototypePage() {
  return (
    <div className="min-h-svh bg-[#F7F8FA] text-ink">
      <header className="border-b border-line bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <div className="border-l-[3px] border-brand pl-3">
            <p className="text-xs font-semibold text-brand-deep">SELLER WORKSPACE · UI PROTOTYPE</p>
            <h1 className="text-lg font-bold tracking-tight text-ink sm:text-xl">Gupta Kirana Store</h1>
          </div>
          <Link href="/" className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">Back to LazyHand</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
        <SellerOrderPrototype />
      </main>
    </div>
  )
}
