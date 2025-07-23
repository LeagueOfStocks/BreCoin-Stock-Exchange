'use client'

import { useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { useRouter } from 'next/navigation'
import MarketOverview from '@/components/MarketOverview'

export default function Home() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) {
      router.push('/login')
    }
  }, [user, router])

  // Your editor now knows everything about the 'user' object!
  // Try typing user. and see the autocompletion.
  return user ? <MarketOverview /> : <div className="text-center p-8">Redirecting to login...</div>;
}