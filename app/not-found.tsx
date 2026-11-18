import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-cream px-6 text-center">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-white p-8 shadow-sm">
        <p className="text-5xl font-black text-brand">404</p>
        <h1 className="mt-2 text-xl font-bold text-ink">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-muted-ink">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white"
        >
          Back to home
        </Link>
      </div>
    </main>
  )
}