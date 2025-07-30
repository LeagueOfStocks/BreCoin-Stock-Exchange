'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/app/context/AuthContext' 
import { Button } from '@/components/ui/button'
import MarketSelector from '@/components/features/market/MarketSelector'
import { Skeleton } from '@/components/ui/skeleton'

const Navigation = () => {
  const pathname = usePathname()
  const { user, signOut, isLoading } = useAuth()

  // Helper function for nav link classes to avoid repetition
  const getLinkClassName = (path: string, isPrefix: boolean = false) => {
    const isActive = isPrefix ? pathname.startsWith(path) : pathname === path;
    return `inline-flex items-center px-4 py-2 transition-all duration-300 relative group text-sm font-medium ${
      isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
    }`;
  };

  return (
    <nav className="bg-white shadow mb-4">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            {user && (
              <div className="flex items-center gap-2">
                <Link href="/" className={getLinkClassName('/')}>
                  Market Overview
                </Link>
                <Link href="/trade" className={getLinkClassName('/trade')}>
                  Trade
                </Link>
                <Link href="/portfolio" className={getLinkClassName('/portfolio')}>
                  Portfolio
                </Link>
                <Link href="/graph" className={getLinkClassName('/graph', true)}>
                  Charts
                </Link>
                <Link href="/top" className={getLinkClassName('/top')}>
                  Top Stocks
                </Link>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Show loading skeleton during auth initialization */}
            {isLoading ? (
              <Skeleton className="w-48 h-10" />
            ) : user ? (
              <>
                <MarketSelector />
                <span className="text-sm text-gray-600">
                  {user.email}
                </span>
                <Button 
                  onClick={signOut}
                  variant="outline"
                  size="sm"
                >
                  Sign Out
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navigation 