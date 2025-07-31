'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMarket } from '@/app/context/MarketContext';
import { TrendingUp, Activity, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Stock {
    player_tag: string;
    champion: string;
    current_price: number;
    price_change_24h: number;
    price_change_percent_24h: number;
    price_change_7d: number;
    price_change_percent_7d: number;
    last_update: string;
}

// Singleton to track if MarketOverview has been rendered before
let hasRenderedBefore = false;
let cachedStocks: Stock[] = [];
let cachedMarketStats = {
  totalValue: 0,
  topGainer: null as Stock | null,
  volatilityIndex: 0,
  lastRefreshed: null as string | null,
};

const MarketOverview = () => {
  const { currentMarket, initialized: marketInitialized } = useMarket();
  const { toast } = useToast();
  const router = useRouter();
  
  const [stocks, setStocks] = useState<Stock[]>(cachedStocks);
  const [marketStats, setMarketStats] = useState(cachedMarketStats);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(hasRenderedBefore);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);

  // --- VOLATILITY HELPER FUNCTIONS ---
  const getVolatilityColor = (volatility: number): string => {
    if (volatility < 1.5) return 'text-green-500';
    if (volatility < 3.0) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getVolatilityDescription = (volatility: number): string => {
    if (volatility < 1.5) return 'Low';
    if (volatility < 3.0) return 'Moderate';
    return 'High';
  };

  const calculateVolatilityIndex = useCallback((stocks: Stock[]): number => {
    if (stocks.length === 0) return 0;
    const volatilities = stocks.map(stock => Math.abs(stock.price_change_percent_24h));
    return volatilities.reduce((sum, vol) => sum + vol, 0) / volatilities.length;
  }, []);

  const calculateMarketStats = useCallback((stocks: Stock[]) => {
    const totalValue = stocks.reduce((sum, stock) => sum + stock.current_price, 0);
    const topGainer = stocks.length > 0 
      ? stocks.reduce((max, stock) => 
          stock.price_change_percent_24h > max.price_change_percent_24h ? stock : max
        )
      : null;
    const volatilityIndex = calculateVolatilityIndex(stocks);
    
    return {
      totalValue,
      topGainer,
      volatilityIndex,
      lastRefreshed: new Date().toLocaleTimeString(),
    };
  }, [calculateVolatilityIndex]);

  const fetchMarketData = useCallback(async () => {
    if (!currentMarket) {
      setLoading(false);
      setInitialized(true);
      hasRenderedBefore = true;
      return;
    }

    // Only show loading if we haven't rendered before
    if (!initialized && !hasRenderedBefore) {
      setLoading(true);
    }

    try {
      const response = await fetch(`${API_URL}/api/markets/${currentMarket.id}/stocks`);
      if (!response.ok) throw new Error('Failed to fetch market data');
      
      const stocksData: Stock[] = await response.json();
      setStocks(stocksData);
      cachedStocks = stocksData; // Cache globally
      
      const stats = calculateMarketStats(stocksData);
      setMarketStats(stats);
      cachedMarketStats = stats; // Cache globally
      
      setHasAttemptedFetch(true);

    } catch (error) {
      console.error('Error fetching market data:', error);
      
      // Only set empty state if we haven't rendered before
      if (!hasRenderedBefore) {
        setStocks([]);
        setMarketStats({ totalValue: 0, topGainer: null, volatilityIndex: 0, lastRefreshed: null });
      }
      
      setHasAttemptedFetch(true);
    } finally {
      setLoading(false);
      setInitialized(true);
      hasRenderedBefore = true;
    }
  }, [currentMarket, initialized, calculateMarketStats]);

  const handleRefresh = useCallback(async () => {
    if (!currentMarket) return;
    setIsRefreshing(true);
    try {
        const response = await fetch(`${API_URL}/api/markets/${currentMarket.id}/refresh`, {
            method: 'POST',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Failed to start refresh');
        
        toast({
            title: "Refresh Initiated",
            description: "Stock prices are being updated. New data will appear shortly.",
        });
        
        // After triggering refresh, fetch new data
        setTimeout(() => {
            fetchMarketData();
        }, 2000); // Wait 2 seconds for backend to process
        
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Refresh Failed", 
            description: error.message,
        });
    } finally {
        setIsRefreshing(false);
    }
  }, [currentMarket, toast, fetchMarketData]);


  useEffect(() => {
    if (!marketInitialized) return;
    fetchMarketData();
  }, [marketInitialized, currentMarket?.id]); // Remove fetchMarketData from dependencies

  // Show loading skeleton only on initial load
  if (!marketInitialized || (loading && !initialized && !hasRenderedBefore)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!currentMarket) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          Welcome to the Stock Market!
        </h2>
        <p className="text-gray-600 mb-8">
          You need to select or create a market to view stock data.
        </p>
        <Button 
          onClick={() => router.push('/markets')}
          className="bg-blue-600 hover:bg-blue-700"
        >
          Manage Your Markets
        </Button>
      </div>
    );
  }

  // Check if we've attempted to fetch but got no data
  if (hasAttemptedFetch && stocks.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          No Market Data
        </h2>
        <p className="text-gray-600 mb-8">
          This market doesn't have any stocks yet. The market creator can add players on the management page.
        </p>
        <Button 
          onClick={handleRefresh}
          variant="outline"
          disabled={isRefreshing}
        >
          {isRefreshing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{currentMarket.name}</h1>
          <p className="text-gray-600">Market overview and top performers</p>
        </div>
        <Button 
          onClick={handleRefresh}
          variant="outline"
          disabled={isRefreshing}
          className="flex items-center"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Market Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Market Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${marketStats.totalValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {stocks.length} stocks tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Performer</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {marketStats.topGainer ? (
              <>
                <div className="text-2xl font-bold text-green-600">
                  +{marketStats.topGainer.price_change_percent_24h.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {marketStats.topGainer.player_tag} ({marketStats.topGainer.champion})
                </p>
              </>
            ) : (
              <div className="text-2xl font-bold text-gray-400">—</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Market Volatility</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getVolatilityColor(marketStats.volatilityIndex)}`}>
              {getVolatilityDescription(marketStats.volatilityIndex)}
            </div>
            <p className="text-xs text-muted-foreground">
              {marketStats.volatilityIndex.toFixed(1)}% avg change
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Stocks Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>All Stocks</CardTitle>
            {marketStats.lastRefreshed && (
              <p className="text-sm text-muted-foreground">
                Last updated: {marketStats.lastRefreshed}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stocks.map((stock) => (
              <div 
                key={`${stock.player_tag}-${stock.champion}`}
                className="flex items-center justify-between p-4 rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => router.push(`/graph/${encodeURIComponent(stock.player_tag)}?champion=${stock.champion}`)}
              >
                <div className="flex items-center space-x-3">
                  <img 
                    src={`/champions/${stock.champion.toLowerCase()}.png`}
                    alt={stock.champion}
                    className="w-10 h-10 rounded-full object-cover"
                    onError={(e) => { 
                      e.currentTarget.src = '/champions/default.png';
                    }}
                  />
                  <div>
                    <h3 className="font-semibold">{stock.player_tag}</h3>
                    <p className="text-sm text-gray-600">{stock.champion}</p>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="font-bold text-lg">${stock.current_price.toFixed(2)}</div>
                  <div className="flex items-center space-x-2 text-sm">
                    <span className={`flex items-center ${stock.price_change_24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stock.price_change_24h >= 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                      {stock.price_change_percent_24h >= 0 ? '+' : ''}{stock.price_change_percent_24h.toFixed(2)}%
                    </span>
                    <span className="text-gray-500">24h</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketOverview; 