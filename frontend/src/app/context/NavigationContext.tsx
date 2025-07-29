'use client'

import { createContext, useState, useEffect, useContext } from 'react'
import { usePathname } from 'next/navigation'

interface NavigationContextType {
  isNavigating: boolean;
  previousPath: string | null;
}

const NavigationContext = createContext<NavigationContextType | null>(null)

export const NavigationProvider = ({ children }: { children: React.ReactNode }) => {
  const [isNavigating, setIsNavigating] = useState(false)
  const [previousPath, setPreviousPath] = useState<string | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    // If we have a previous path and it's different from current, we're navigating
    if (previousPath && previousPath !== pathname) {
      setIsNavigating(true)
      
      // Clear the navigation state after a short delay
      const timer = setTimeout(() => {
        setIsNavigating(false)
      }, 100) // Very short delay to prevent skeleton flash
      
      return () => clearTimeout(timer)
    }
    
    // Update previous path
    setPreviousPath(pathname)
  }, [pathname, previousPath])

  const value: NavigationContextType = {
    isNavigating,
    previousPath,
  }

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export const useNavigation = () => {
  const context = useContext(NavigationContext)
  if (context === null) {
    throw new Error('useNavigation must be used within a NavigationProvider')
  }
  return context
} 