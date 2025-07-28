'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/app/context/AuthContext' 
import { Button } from '@/components/ui/button'
import MarketSelector from './MarketSelector' 

const Navigation = () => {
  const pathname = usePathname()
  const { user, signOut } = useAuth()

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
          <div className="flex items-center"> {/* Group the links and selector together */}
            {user && (
              <div className="flex items-center gap-2">
                {/* Your Existing Links */}
                <Link href="/" className={getLinkClassName('/')}>
                  Market Overview
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300"/>
                </Link>
                <Link href="/trade" className={getLinkClassName('/trade')}>
                  Trade
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300"/>
                </Link>
                <Link href="/portfolio" className={getLinkClassName('/portfolio')}>
                  Portfolio
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300"/>
                </Link>
                <Link href="/graph" className={getLinkClassName('/graph', true)}>
                  Graphs
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300"/>
                </Link>
                <Link href="/top" className={getLinkClassName('/top')}>
                  Top Performers
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-500 group-hover:w-full transition-all duration-300"/>
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4"> {/* Right side of the nav */}
            {user ? (
              <>
                <MarketSelector /> {/* Add the selector here */}
                <Button variant="outline" onClick={signOut}>Logout</Button>
              </>
            ) : (
                // Only show login button if not already on the login page
                pathname !== '/login' && <Link href="/login"><Button>Login</Button></Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navigation