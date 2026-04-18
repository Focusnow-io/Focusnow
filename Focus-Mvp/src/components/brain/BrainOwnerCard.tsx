export function BrainOwnerCard({
  initials,
  name,
  subtitle,
}: {
  initials: string
  name: string
  subtitle: string
}) {
  return (
    <div className="flex items-center gap-3 bg-white border border-[#E2E8F0] rounded-lg px-3.5 py-2.5 min-w-[200px]">
      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
        <span className="text-sm font-medium text-slate-600">{initials}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[#0F172A] truncate">{name}</p>
        <p className="text-xs text-[#94A3B8] truncate">{subtitle}</p>
      </div>
    </div>
  )
}
