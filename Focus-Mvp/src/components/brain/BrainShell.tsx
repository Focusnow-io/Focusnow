'use client'

import { useState, useEffect } from 'react'
import { BrainLeftRail } from './BrainLeftRail'
import { BrainCommandPalette } from './BrainCommandPalette'

export function BrainShell({ children }: { children: React.ReactNode }) {
  const [cmdOpen, setCmdOpen] = useState(false)
  const [mobileRailOpen, setMobileRailOpen] = useState(false)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(true)
      }
      if (e.key === 'Escape') setCmdOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex -m-6 h-[calc(100vh-52px)]">
      <div className="hidden md:flex">
        <BrainLeftRail onSearch={() => setCmdOpen(true)} />
      </div>

      {mobileRailOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileRailOpen(false)}>
          <div className="fixed inset-0 bg-black/25" />
          <div className="relative w-[236px] h-full" onClick={(e) => e.stopPropagation()}>
            <BrainLeftRail onSearch={() => { setCmdOpen(true); setMobileRailOpen(false) }} />
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="md:hidden px-4 pt-3 pb-1">
          <button
            onClick={() => setMobileRailOpen(true)}
            className="text-xs text-[#475569] hover:text-[#0F172A] transition-colors"
          >
            ☰ Navigation
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </main>

      {cmdOpen && <BrainCommandPalette onClose={() => setCmdOpen(false)} />}
    </div>
  )
}
