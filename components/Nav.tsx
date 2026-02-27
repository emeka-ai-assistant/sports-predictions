'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Nav() {
  const path = usePathname()

  const links = [
    { href: '/',            label: 'Today' },
    { href: '/history',     label: 'History' },
    { href: '/accumulator', label: '💰 Accum' },
  ]

  return (
    <nav className="bg-[#0f1923] border-b border-[#1e3a5f] sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">⚽</span>
          <span className="font-bold text-white text-lg tracking-tight">
            Sure<span className="text-green-400">Picks</span>
          </span>
        </Link>
        <div className="flex gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                path === href
                  ? 'bg-green-500 text-black'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
