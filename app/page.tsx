import LazyHandWebApp from '../components/lazyhand-web-app'

export default function Page() {
  const previewMode = process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview'
  return <LazyHandWebApp previewMode={previewMode} />
}

