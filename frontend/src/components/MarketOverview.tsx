'use client'

import React, { useState, useEffect, useCallback } from 'react';
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

const MarketOverview = () => {
  const { currentMarket } = useMarket();
  const { toast } = useToast();
  const router = useRouter();
  
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [marketStats, setMarketStats] = useState({
    totalValue: 0,
    topGainer: null as Stock | null,
    volatilityIndex: 0,
    lastRefreshed: null as string | null,
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- VOLATILITY HELPER FUNCTIONS (NOW CORRECTLY INCLUDED) ---
  const getVolatilityColor = (volatility: number): string => {
    if (volatility < 1.5) return 'text-green-500';
    if (volatility < 3.0) return 'text-yellow-500';
    if (volatility < 5.0) return 'text-orange-500';
    return 'text-red-500';
  };

  const calculateVolatility = (stockData: Stock[]): number => {
    if (!stockData || stockData.length < 2) return 0;
    const absoluteDailyChanges = stockData.map(stock => Math.abs(stock.price_change_24h));
    const mean = absoluteDailyChanges.reduce((sum, change) => sum + change, 0) / absoluteDailyChanges.length;
    const variance = absoluteDailyChanges.reduce((sum, change) => sum + Math.pow(change - mean, 2), 0) / absoluteDailyChanges.length;
    return Math.sqrt(variance); // Return standard deviation as the volatility index
  };
  
  // --- DATA FETCHING ---
  const fetchData = useCallback(async () => {
    if (!currentMarket) {
        setLoading(false);
        setStocks([]);
        return;
    }
    setLoading(true);
    try {
        const response = await fetch(`${API_URL}/api/markets/${currentMarket.id}/stocks`);
        if (!response.ok) throw new Error('Failed to fetch market data');
        const stocksData: Stock[] = await response.json();
        
        setStocks(stocksData);
        
        const totalValue = stocksData.reduce((sum, stock) => sum + stock.current_price, 0);
        const topGainer = stocksData.reduce((prev, curr) => 
          (curr.price_change_percent_24h > (prev?.price_change_percent_24h || -Infinity)) ? curr : prev, null);
        
        const lastRefreshed = stocksData.length > 0 
            ? stocksData.reduce((latest, stock) => new Date(stock.last_update) > new Date(latest) ? stock.last_update : latest, stocksData[0].last_update)
            : null;
        
        const volatility = calculateVolatility(stocksData);
            
        setMarketStats({ totalValue, topGainer, lastRefreshed, volatilityIndex: volatility });

    } catch (error) {
        console.error('Error fetching market overview data:', error);
        setStocks([]);
    } finally {
        setLoading(false);
    }
  }, [currentMarket]);

  useEffect(() => {
    if (currentMarket) {
        fetchData();
    }
  }, [fetchData, currentMarket]); 
  
  const handleRefresh = async () => {
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
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Refresh Failed",
            description: error.message,
        });
    } finally {
        setIsRefreshing(false);
    }
  };

  if (loading) {
    return <div className="space-y-6"><Skeleton className="h-28 w-full" /><Skeleton className="h-96 w-full" /></div>
  }

  if (!currentMarket || stocks.length === 0) {
    return (
        <div className="text-center py-20">
            <h2 className="text-xl font-semibold">No Market Data</h2>
            <p className="text-muted-foreground mt-2">
                This market has no stocks yet. The creator can add players on the management page.
            </p>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* --- NEW: Page Header with Refresh Button --- */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Market Overview: {currentMarket.name}</h1>
          {marketStats.lastRefreshed && (
            <p className="text-sm text-muted-foreground">
              Last updated: {new Date(marketStats.lastRefreshed).toLocaleString()}
            </p>
          )}
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
        </Button>
      </div>

      {/* Market Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Market Value</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${marketStats.totalValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Sum of all current stock prices</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top 24h Gainer</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{marketStats.topGainer?.player_tag || 'N/A'}</div>
            <p className="text-xs text-green-500">
              {marketStats.topGainer ? 
                `+${marketStats.topGainer.price_change_percent_24h.toFixed(2)}%` : 
                'No change'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Market Volatility</CardTitle>
            <Activity className={`h-4 w-4 ${getVolatilityColor(marketStats.volatilityIndex)}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getVolatilityColor(marketStats.volatilityIndex)}`}>
              {marketStats.volatilityIndex.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Based on 24h price swings</p>
          </CardContent>
        </Card>
      </div>

      {/* Stock Table */}
      <Card>
        <CardHeader>
          <CardTitle>Market Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-semibold">Player</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold">Price</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold">24h Change</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold">7d Change</th>
                  <th className="px-4 py-2 text-center text-sm font-semibold">24h Trend</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock) => (
                  <tr 
                    key={`${stock.player_tag}-${stock.champion}`}
                    // TODO: Update this route to be market-aware
                    onClick={() => router.push(`/graph/${encodeURIComponent(stock.player_tag)}`)}
                    className="cursor-pointer hover:bg-muted/50 border-b"
                  >
                    <td className="p-4">
                        <div className="font-medium">{stock.player_tag}</div>
                        <div className="text-sm text-muted-foreground">{stock.champion}</div>
                    </td>
                    <td className="p-4 text-right font-medium">${stock.current_price.toFixed(2)}</td>
                    <td className={`p-4 text-right ${stock.price_change_percent_24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stock.price_change_percent_24h.toFixed(2)}%
                    </td>
                    <td className={`p-4 text-right ${stock.price_change_percent_7d >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stock.price_change_percent_7d.toFixed(2)}%
                    </td>
                    <td className="p-4 text-center">
                      {stock.price_change_24h >= 0 ? (
                        <ArrowUpRight className="inline h-5 w-5 text-green-500" />
                      ) : (
                        <ArrowDownRight className="inline h-5 w-5 text-red-500" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketOverview;