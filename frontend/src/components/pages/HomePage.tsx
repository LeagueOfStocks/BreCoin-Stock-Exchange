'use client'

import { useEffect } from 'react'
import { useAuth } from '@/app/context/AuthContext'
import { useRouter } from 'next/navigation'
import MarketOverview from '@/components/features/market/MarketOverview'
import { Skeleton } from '@/components/ui/skeleton'

export default function HomePage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Only redirect if we're not loading and there's no user
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, router, isLoading])

  // Only show loading skeleton on very initial load
  if (isLoading) {
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