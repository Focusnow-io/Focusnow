import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function BrainBackLink() {
  return (
    <Link
      href="/brain"
      className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      Operational Brain
    </Link>
  )
}
