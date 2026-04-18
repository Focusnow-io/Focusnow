'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function DynamicListSection({
  title,
  subtitle,
  items,
  onChange,
}: {
  title: string
  subtitle?: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  const [open, setOpen] = useState(() => items.some((i) => i.length > 0))

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wide"
      >
        <span className={cn('transition-transform', open && 'rotate-90')}>
          &#9656;
        </span>
        {title}
        {subtitle && (
          <span className="font-normal normal-case tracking-normal text-slate-400 ml-1">
            — {subtitle}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(e) => {
                  const next = [...items]
                  next[i] = e.target.value
                  onChange(next)
                }}
                placeholder={`${title} ${i + 1}`}
                className="rounded-lg flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  const next = items.filter((_, j) => j !== i)
                  onChange(next.length > 0 ? next : [''])
                }}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...items, ''])}
            className="text-xs text-orange-600 hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      )}
    </div>
  )
}
