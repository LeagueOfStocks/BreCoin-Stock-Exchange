'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'
import { useAuth } from '@/app/context/AuthContext'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Skeleton } from '@/components/ui/skeleton'

// Define types for our data
interface Stock {
  player_tag: string;
  champion: string;
  current_price: number;
}

interface UserHolding {
    current_shares: number;
}

export default function TradePage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [stocks, setStocks] = useState<Stock[]>([])
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [userHoldings, setUserHoldings] = useState<UserHolding | null>(null)
  const [userGold, setUserGold] = useState<number>(0)
  const [sharesAmount, setSharesAmount] = useState<number | ''>('')
  const [loading, setLoading] = useState(true)
  const [tradeLoading, setTradeLoading] = useState(false)

  // Fetch all available stocks and user's gold on initial load
  useEffect(() => {
    if (!user) return
    setLoading(true)

    const fetchInitialData = async () => {
      const { data: stocksData } = await supabase.from('stocks').select('*')
      const { data: profileData } = await supabase.from('profiles').select('gold').eq('id', user.id).single()

      if (stocksData) setStocks(stocksData as Stock[])
      if (profileData) setUserGold(profileData.gold)
      
      setLoading(false)
    }
    fetchInitialData()
  }, [user])

  // Fetch user's specific holdings whenever a new stock is selected
  useEffect(() => {
    if (!selectedStock || !user) return

    const fetchHoldings = async () => {
        const { data } = await supabase
            .from('portfolio_view')
            .select('current_shares')
            .eq('user_id', user.id)
            .eq('player_tag', selectedStock.player_tag)
            .single()
        
        setUserHoldings(data)
    }
    fetchHoldings()
  }, [selectedStock, user])

  const handleTrade = async (tradeType: 'BUY' | 'SELL') => {
    if (!user || !selectedStock || !sharesAmount || sharesAmount <= 0) return

    setTradeLoading(true)
    const functionName = tradeType === 'BUY' ? 'buy_stock' : 'sell_stock'
    const args = {
        p_user_id: user.id,
        p_player_tag: selectedStock.player_tag,
        p_champion: selectedStock.champion,
        [tradeType === 'BUY' ? 'p_shares_to_buy' : 'p_shares_to_sell']: sharesAmount
    }

    const { error } = await supabase.rpc(functionName, args)

    if (error) {
        toast({
            variant: "destructive",
            title: "Trade Failed",
            description: error.message,
        })
    } else {
        toast({
            title: "Trade Successful!",
            description: `You successfully ${tradeType.toLowerCase()}ed ${sharesAmount} shares of ${selectedStock.player_tag}.`,
        })
        // Refresh data after a successful trade
        const { data: profileData } = await supabase.from('profiles').select('gold').eq('id', user.id).single()
        if (profileData) setUserGold(profileData.gold)
        setSharesAmount('')
    }
    setTradeLoading(false)
  }

  // Loading state for the main page
  if (loading) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-[500px] md:col-span-1" />
            <Skeleton className="h-[500px] md:col-span-2" />
        </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Left Column: Stock Selector */}
      <Card className="md:col-span-1">
        <CardHeader><CardTitle>Market</CardTitle></CardHeader>
        <CardContent className="max-h-[600px] overflow-y-auto">
          {stocks.map(stock => (
            <div
              key={stock.player_tag}
              onClick={() => setSelectedStock(stock)}
              className={`p-3 rounded-lg cursor-pointer border ${selectedStock?.player_tag === stock.player_tag ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-gray-100'}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{stock.player_tag}</p>
                  <p className="text-sm text-muted-foreground">{stock.champion}</p>
                </div>
                <p className="font-bold text-lg">${stock.current_price.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Right Column: Trade Terminal */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Trade Terminal</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedStock ? (
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <p className="text-muted-foreground">Select a stock from the market list to begin.</p>
            </div>
          ) : (
            <Tabs defaultValue="buy" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="buy">Buy</TabsTrigger>
                <TabsTrigger value="sell">Sell</TabsTrigger>
              </TabsList>
              
              {/* Buy Tab Content */}
              <TabsContent value="buy">
                <div className="p-4 space-y-4">
                  <div className="flex justify-between text-lg"><span>Available Gold:</span> <span className="font-semibold">{userGold.toFixed(2)}</span></div>
                  <div className="flex justify-between text-lg"><span>Price per Share:</span> <span className="font-semibold">${selectedStock.current_price.toFixed(2)}</span></div>
                  <Input type="number" placeholder="Number of shares" value={sharesAmount} onChange={(e) => setSharesAmount(e.target.value === '' ? '' : Number(e.target.value))} />
                  <div className="text-xl font-bold">Total Cost: ${((sharesAmount || 0) * selectedStock.current_price).toFixed(2)}</div>
                  <Button className="w-full" onClick={() => handleTrade('BUY')} disabled={tradeLoading}>
                    {tradeLoading ? 'Processing...' : 'Confirm Buy'}
                  </Button>
                </div>
              </TabsContent>
              
              {/* Sell Tab Content */}
              <TabsContent value="sell">
                <div className="p-4 space-y-4">
                  <div className="flex justify-between text-lg"><span>Shares Owned:</span> <span className="font-semibold">{userHoldings?.current_shares || 0}</span></div>
                  <div className="flex justify-between text-lg"><span>Price per Share:</span> <span className="font-semibold">${selectedStock.current_price.toFixed(2)}</span></div>
                  <Input type="number" placeholder="Number of shares" value={sharesAmount} onChange={(e) => setSharesAmount(e.target.value === '' ? '' : Number(e.target.value))} />
                  <div className="text-xl font-bold">Total Value: ${((sharesAmount || 0) * selectedStock.current_price).toFixed(2)}</div>
                  <Button className="w-full" variant="destructive" onClick={() => handleTrade('SELL')} disabled={tradeLoading}>
                    {tradeLoading ? 'Processing...' : 'Confirm Sell'}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  )
}