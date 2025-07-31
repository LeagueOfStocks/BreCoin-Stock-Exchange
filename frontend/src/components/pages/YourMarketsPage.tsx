'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/context/AuthContext'
import { useMarket } from '@/app/context/MarketContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { Plus, Users, Settings, Crown, Copy, Check } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Market {
  id: number
  name: string
  creator_id?: string
  invite_code?: string
  member_count?: number
}

interface UserProfile {
  subscription_tier: 'free' | 'premium' | 'pro'
}

// Singleton cache for markets data
let hasMarketsRenderedBefore = false
let cachedMarkets: Market[] = []

const YourMarketsPage = () => {
  const { user, isLoading: authLoading } = useAuth()
  const { userMarkets, refreshUserMarkets, selectMarket, currentMarket } = useMarket()
  const { toast } = useToast()
  const router = useRouter()

  const [markets, setMarkets] = useState<Market[]>(cachedMarkets)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(!hasMarketsRenderedBefore)
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  
  // Form states
  const [createMarketName, setCreateMarketName] = useState('')
  const [joinInviteCode, setJoinInviteCode] = useState('')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [joinDialogOpen, setJoinDialogOpen] = useState(false)

  const fetchUserProfile = useCallback(async () => {
    if (!user) return
    
    try {
      const response = await fetch(`${API_URL}/api/users/${user.id}/profile`)
      if (!response.ok) throw new Error('Failed to fetch user profile')
      
      const profileData = await response.json()
      setUserProfile({ 
        subscription_tier: profileData.subscription_tier || 'free' 
      })
    } catch (error) {
      console.error('Error fetching user profile:', error)
      // Fallback to free tier if fetch fails
      setUserProfile({ subscription_tier: 'free' })
    }
  }, [user])

  const fetchMarkets = useCallback(async () => {
    if (!user) return

    try {
      // Use the existing userMarkets from context, but also get additional details
      const response = await fetch(`${API_URL}/api/users/${user.id}/markets`)
      if (!response.ok) throw new Error('Failed to fetch markets')
      
      const marketData = await response.json()
      
      // Enhance with additional details if needed
      const enhancedMarkets = marketData.map((market: Market) => ({
        ...market,
        member_count: market.member_count || 0
      }))
      
      setMarkets(enhancedMarkets)
      cachedMarkets = enhancedMarkets
      
    } catch (error) {
      console.error('Error fetching markets:', error)
      if (!hasMarketsRenderedBefore) {
        setMarkets([])
      }
    } finally {
      setLoading(false)
      hasMarketsRenderedBefore = true
    }
  }, [user])

  const getTierLimits = (tier: string) => {
    const limits = {
      free: { markets: 1, displayName: 'Free' },
      premium: { markets: 1, displayName: 'Premium' },
      pro: { markets: 3, displayName: 'Pro' }
    }
    return limits[tier as keyof typeof limits] || limits.free
  }

  const canCreateOrJoinMore = () => {
    if (!userProfile) return false
    const limits = getTierLimits(userProfile.subscription_tier)
    return markets.length < limits.markets
  }

  const handleCreateMarket = async () => {
    if (!user || !createMarketName.trim()) return
    
    if (!canCreateOrJoinMore()) {
      const limits = getTierLimits(userProfile?.subscription_tier || 'free')
      toast({
        variant: "destructive",
        title: "Market Limit Reached",
        description: `Your ${limits.displayName} plan only allows ${limits.markets} market(s). Upgrade to Pro for more.`
      })
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch(`${API_URL}/api/markets/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createMarketName.trim(),
          creator_id: user.id
        })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Failed to create market')

      toast({
        title: "Market Created",
        description: `Successfully created "${createMarketName}". Invite code: ${result.invite_code}`
      })

      setCreateMarketName('')
      setCreateDialogOpen(false)
      
      // Refresh markets and market context
      await Promise.all([fetchMarkets(), refreshUserMarkets()])
      
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Creation Failed",
        description: error.message
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleJoinMarket = async () => {
    if (!user || !joinInviteCode.trim()) return
    
    if (!canCreateOrJoinMore()) {
      const limits = getTierLimits(userProfile?.subscription_tier || 'free')
      toast({
        variant: "destructive",
        title: "Market Limit Reached",
        description: `Your ${limits.displayName} plan only allows ${limits.markets} market(s). Upgrade to Pro for more.`
      })
      return
    }

    setIsJoining(true)
    try {
      const response = await fetch(`${API_URL}/api/markets/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_code: joinInviteCode.trim(),
          user_id: user.id
        })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Failed to join market')

      toast({
        title: "Market Joined",
        description: result.message || "Successfully joined the market!"
      })

      setJoinInviteCode('')
      setJoinDialogOpen(false)
      
      // Refresh markets and market context
      await Promise.all([fetchMarkets(), refreshUserMarkets()])
      
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Join Failed",
        description: error.message
      })
    } finally {
      setIsJoining(false)
    }
  }

  const handleCopyInviteCode = async (inviteCode: string) => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopiedCode(inviteCode)
      toast({
        title: "Copied!",
        description: "Invite code copied to clipboard"
      })
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Could not copy invite code"
      })
    }
  }

  useEffect(() => {
    if (authLoading || !user) return
    
    fetchUserProfile()
    fetchMarkets()
  }, [user, authLoading, fetchUserProfile, fetchMarkets])

  if (authLoading || !user) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (loading && !hasMarketsRenderedBefore) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const limits = getTierLimits(userProfile?.subscription_tier || 'free')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Markets</h1>
          <p className="text-gray-600">
            Manage your markets ({markets.length}/{limits.markets} used)
          </p>
        </div>
        
        <div className="flex gap-3">
          {/* Join Market Dialog */}
          <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                disabled={!canCreateOrJoinMore()}
                className="flex items-center"
              >
                <Users className="w-4 h-4 mr-2" />
                Join Market
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join Market</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="invite-code">Invite Code</Label>
                  <Input
                    id="invite-code"
                    value={joinInviteCode}
                    onChange={(e) => setJoinInviteCode(e.target.value)}
                    placeholder="Enter invite code..."
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinMarket()}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setJoinDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleJoinMarket}
                    disabled={isJoining || !joinInviteCode.trim()}
                  >
                    {isJoining ? 'Joining...' : 'Join Market'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Create Market Dialog */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                disabled={!canCreateOrJoinMore()}
                className="flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Market
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Market</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="market-name">Market Name</Label>
                  <Input
                    id="market-name"
                    value={createMarketName}
                    onChange={(e) => setCreateMarketName(e.target.value)}
                    placeholder="Enter market name..."
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateMarket()}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateMarket}
                    disabled={isCreating || !createMarketName.trim()}
                  >
                    {isCreating ? 'Creating...' : 'Create Market'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tier Limitation Notice */}
      {!canCreateOrJoinMore() && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-amber-800">
                  Market Limit Reached
                </h3>
                <p className="text-sm text-amber-700">
                  Your {limits.displayName} plan allows {limits.markets} market(s). 
                  Upgrade to Pro to join up to 3 markets.
                </p>
              </div>
              <Button variant="outline" size="sm">
                Upgrade Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Markets Grid */}
      {markets.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Markets Yet
              </h3>
              <p className="text-gray-600 mb-6">
                Create your first market or join one using an invite code.
              </p>
              <div className="flex gap-3 justify-center">
                <Button 
                  variant="outline" 
                  onClick={() => setJoinDialogOpen(true)}
                  className="flex items-center"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Join Market
                </Button>
                <Button 
                  onClick={() => setCreateDialogOpen(true)}
                  className="flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Market
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {markets.map((market) => (
            <Card 
              key={market.id} 
              className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                currentMarket?.id === market.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => selectMarket(market)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {market.name}
                      {user.id === market.creator_id && (
                        <Crown className="w-4 h-4 text-yellow-500" />
                      )}
                    </CardTitle>
                    {currentMarket?.id === market.id && (
                      <Badge variant="secondary" className="mt-1">
                        Current Market
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/market/${market.id}`)
                    }}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Members</span>
                    <span className="font-medium">{market.member_count || 'N/A'}</span>
                  </div>
                  
                  {user.id === market.creator_id && market.invite_code && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Invite Code</span>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {market.invite_code}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyInviteCode(market.invite_code!)
                          }}
                        >
                          {copiedCode === market.invite_code ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  <div className="pt-2 border-t">
                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        selectMarket(market)
                        router.push('/')
                      }}
                    >
                      {currentMarket?.id === market.id ? 'View Market' : 'Switch to Market'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default YourMarketsPage