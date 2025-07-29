'use client'

import { useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { useNavigation } from './context/NavigationContext'
import { useRouter } from 'next/navigation'
import MarketOverview from '@/components/MarketOverview'
import { Skeleton } from '@/components/ui/skeleton'

export default function Home() {
  const { user, isLoading } = useAuth()
  const { isNavigating } = useNavigation()
  const router = useRouter()

  useEffect(() => {
    // Only redirect if we're not loading and there's no user
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, router, isLoading])

  // Show loading skeleton while checking auth, but not during navigation
  if (isLoading && !isNavigating) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  // Show content if user exists, otherwise show loading message
  if (user) {
    return <MarketOverview />
  }

  // This will only show briefly before redirect
  return (
    <div className="text-center p-8">
      <div className="animate-pulse">Redirecting to login...</div>
    </div>
  )
}