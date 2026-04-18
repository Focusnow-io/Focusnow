import { cn } from '@/lib/utils'

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function UserAvatar({
  name,
  size = 'sm',
}: {
  name: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className={cn(
        'rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center shrink-0',
        size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'
      )}
    >
      <span
        className={cn(
          'font-semibold text-white',
          size === 'sm' ? 'text-[8px]' : 'text-[9px]'
        )}
      >
        {getInitials(name)}
      </span>
    </div>
  )
}
