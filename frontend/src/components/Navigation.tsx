'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const Navigation = () => {
  const pathname = usePathname()

  return (
    <nav className="bg-white shadow mb-4">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link 
              href="/"
              className={`
                inline-flex items-center px-4 py-2
                transition-all duration-200
                relative
                group
                ${pathname === '/' ? 'text-blue-600 font-medium' : 'text-gray-600'}
              `}
            >
              Market Overview
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300"/>
            </Link>
            <Link 
              href="/graph"
              className={`
                inline-flex items-center px-4 py-2
                transition-all duration-300
                relative
                group
                ${pathname.startsWith('/graph') ? 'text-blue-600 font-medium' : 'text-gray-600'}
              `}
            >
              Graphs
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300"/>
            </Link>
            <Link 
              href="/top"
              className={`
                inline-flex items-center px-4 py-2
                transition-all duration-300
                relative
                group
                ${pathname === '/top' ? 'text-blue-600 font-medium' : 'text-gray-600'}
              `}
            >
              Top Performers
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300"/>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navigation