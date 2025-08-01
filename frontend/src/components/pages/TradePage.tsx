'use client'

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { useMarket } from '@/app/context/MarketContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from '@/components/ui/skeleton';

// Define types for our data
interface Stock {
  player_tag: string;
  champions: string[];
  current_price: number;
  price_change_24h: number;
  price_change_percent_24h: number;
  price_change_7d: number;
  price_change_percent_7d: number;
  last_update: string;
}

interface UserHolding {
    current_shares: number;
}

// Singleton to track if TradePage has been rendered before
let hasTradeRenderedBefore = false;
let cachedTradeStocks: Stock[] = [];

export default function TradePage() {
  const { user } = useAuth();
  const { currentMarket, initialized: marketInitialized } = useMarket();
  const { toast } = useToast();

  const [stocks, setStocks] = useState<Stock[]>(cachedTradeStocks);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [userHoldings, setUserHoldings] = useState<UserHolding | null>(null);
  const [userGold, setUserGold] = useState<number>(0);
  const [sharesAmount, setSharesAmount] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(hasTradeRenderedBefore);
  const [tradeLoading, setTradeLoading] = useState(false);

  // Fetch all available stocks and user's gold on initial load
  useEffect(() => {
    // Wait for market context to be ready
    if (!marketInitialized) return;

    // If no market or user is selected, there's nothing to show.
    if (!user || !currentMarket) {
        setLoading(false);
        setInitialized(true);
        hasTradeRenderedBefore = true;
        return;
    }

    // Only show loading on first initialization
    if (!initialized && !hasTradeRenderedBefore) {
        setLoading(true);
    }

    const fetchInitialData = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        
        // Fetch stocks from new backend API
        const stocksResponse = await fetch(`${API_URL}/api/markets/${currentMarket.id}/stocks`);
        if (!stocksResponse.ok) {
          throw new Error(`Failed to fetch stocks: ${stocksResponse.status}`);
        }
        const stocksData = await stocksResponse.json();
        
        // TODO: Fetch user profile from backend instead of Supabase once endpoint exists
        const { data: profileData } = await supabase
            .from('profiles')
            .select('gold')
            .eq('id', user.id)
            .single();

        if (stocksData) {
          setStocks(stocksData as Stock[]);
          cachedTradeStocks = stocksData as Stock[]; // Cache globally
        }
        if (profileData) setUserGold(profileData.gold);

      } catch (error) {
        console.error("Error fetching trade data:", error);
      } finally {
        setLoading(false);
        setInitialized(true);
        hasTradeRenderedBefore = true;
      }
    };
    fetchInitialData();
  }, [user?.id, currentMarket?.id, marketInitialized]); // Remove 'initialized' from dependencies

  // Fetch user's specific holdings whenever a new stock is selected
  useEffect(() => {
    if (!selectedStock || !user || !currentMarket) return;

    const fetchHoldings = async () => {
      if (!selectedStock || !user || !currentMarket) return;

      // Querying the transactions table directly gives the most accurate sum
      // for a specific player across all their champions.
      const { data, error } = await supabase
          .from('transactions')
          .select('transaction_type, shares')
          .eq('user_id', user.id)
          .eq('market_id', currentMarket.id)
          .eq('player_tag', selectedStock.player_tag);

      if (error) {
          console.error("Error fetching holdings:", error);
          setUserHoldings(null); // Set to null on error
          return;
      }

      // Calculate the total shares by summing buys and subtracting sells
      const totalShares = data.reduce((acc, tx) => {
          return tx.transaction_type === 'BUY' ? acc + tx.shares : acc - tx.shares;
      }, 0);
      
      // The setUserHoldings function expects an object like { current_shares: number }
      setUserHoldings({ current_shares: totalShares });
    };

    fetchHoldings();
  }, [selectedStock?.player_tag, user?.id, currentMarket?.id]);


  const handleTrade = async (tradeType: 'BUY' | 'SELL') => {
    if (!user || !selectedStock || !sharesAmount || sharesAmount <= 0 || !currentMarket) return;

    setTradeLoading(true);
    const functionName = tradeType === 'BUY' ? 'buy_stock' : 'sell_stock';
    const args = {
      p_user_id: user.id,
      p_market_id: currentMarket.id, // <-- Add the market_id
      p_player_tag: selectedStock.player_tag,
      // The p_champion argument is now completely removed
      [tradeType === 'BUY' ? 'p_shares_to_buy' : 'p_shares_to_sell']: sharesAmount
  };

    const { error } = await supabase.rpc(functionName, args);

    if (error) {
        toast({
            variant: "destructive",
            title: "Trade Failed",
            description: error.message,
        });
    } else {
        toast({
            title: "Trade Successful!",
            description: `You successfully ${tradeType.toLowerCase()}ed ${sharesAmount} shares of ${selectedStock.player_tag}.`,
        });
        
        // --- Refresh data after a successful trade ---
        const { data: profileData } = await supabase.from('profiles').select('gold').eq('id', user.id).single();
        if (profileData) setUserGold(profileData.gold);
        // Refetch holdings for the selected stock
         const { data: holdingsData } = await supabase
            .from('portfolio_view')
            .select('current_shares')
            .eq('user_id', user.id)
            .eq('market_id', currentMarket.id)
            .eq('player_tag', selectedStock.player_tag)
            .single(); // Remove champion filter since it's now player-based
        setUserHoldings(holdingsData)

        setSharesAmount(''); // Clear the input
    }
    setTradeLoading(false);
  }

  // Only show loading skeleton on true initial load
  if (!marketInitialized || (loading && !initialized && !hasTradeRenderedBefore)) {
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
                  <p className="text-sm text-muted-foreground">
                    {stock.champions.join(', ')}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`${stock.price_change_24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stock.price_change_24h >= 0 ? '+' : ''}{stock.price_change_percent_24h?.toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground">24h</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">${stock.current_price?.toFixed(2) || '10.00'}</p>
                  <p className={`text-sm ${stock.price_change_24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stock.price_change_24h >= 0 ? '+' : ''}${stock.price_change_24h?.toFixed(2) || '0.00'}
                  </p>
                </div>
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