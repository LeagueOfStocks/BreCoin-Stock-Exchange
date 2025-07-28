'use client'

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMarket } from '@/app/context/MarketContext'; // <-- Import our global market context
import { TrendingUp, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Define the type for a single stock coming from our new API endpoint
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
  const { currentMarket } = useMarket(); // <-- Get the currently selected market
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [marketStats, setMarketStats] = useState({
    totalValue: 0,
    averagePrice: 0,
    topGainer: null as Stock | null,
    volatilityIndex: 0
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const calculateVolatility = (stockData: Stock[]): number => {
    if (!stockData || stockData.length === 0) return 0;
    
    // The new endpoint gives us 'price_change_24h' directly
    const absoluteDailyChanges = stockData.map(stock => Math.abs(stock.price_change_24h));
    
    if (absoluteDailyChanges.length < 2) return 0; // Need at least 2 data points for variance

    const totalMovement = absoluteDailyChanges.reduce((sum, change) => sum + change, 0);
    const mean = totalMovement / absoluteDailyChanges.length;
    
    const variance = absoluteDailyChanges.reduce((sum, change) => {
      const diff = change - mean;
      return sum + (diff * diff);
    }, 0) / absoluteDailyChanges.length;
    
    const standardDeviation = Math.sqrt(variance);
    
    // A simplified but effective volatility score
    const volatilityScore = standardDeviation * 10;
    
    return Math.min(100, Math.max(0, volatilityScore)); // Capped between 0 and 100
  };
  
  useEffect(() => {
    // This effect will re-run whenever the user selects a new market
    if (!currentMarket) {
        setLoading(false);
        setStocks([]);
        return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Make a single call to our new, powerful, market-aware endpoint
        const response = await fetch(`${API_URL}/api/markets/${currentMarket.id}/stocks`);
        if (!response.ok) {
            throw new Error('Failed to fetch market data');
        }
        const stocksData: Stock[] = await response.json();
        
        setStocks(stocksData);
        
        // --- Recalculate all stats based on the new data ---
        const totalValue = stocksData.reduce((sum, stock) => sum + stock.current_price, 0);
        const avgPrice = stocksData.length > 0 ? totalValue / stocksData.length : 0;
        
        // Find the top gainer based on 24h percentage change
        const topGainer = stocksData.reduce((prev, curr) => 
          (curr.price_change_percent_24h > (prev?.price_change_percent_24h || -Infinity)) ? curr : prev, null);
        
        const volatility = calculateVolatility(stocksData);
        
        setMarketStats({
          totalValue,
          averagePrice: avgPrice,
          topGainer,
          volatilityIndex: volatility
        });

      } catch (error) {
        console.error('Error fetching market overview data:', error);
        setStocks([]); // Clear data on error
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    // Set up an interval to refresh the data periodically
    const interval = setInterval(fetchData, 60000); // every 60 seconds
    return () => clearInterval(interval);
  }, [currentMarket]); // The dependency array ensures this runs when the market changes
    
  const getVolatilityColor = (volatility: number): string => {
    if (volatility < 15) return 'text-green-500';
    if (volatility < 30) return 'text-yellow-500';
    if (volatility < 50) return 'text-orange-500';
    return 'text-red-500';
  };

  if (loading) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
            </div>
            <Skeleton className="h-96" />
        </div>
    )
  }

  if (!currentMarket || stocks.length === 0) {
    return (
        <div className="text-center py-20">
            <h2 className="text-xl font-semibold">No Market Data</h2>
            <p className="text-muted-foreground mt-2">
                This market has no stocks yet. The market creator can add players in the management page.
            </p>
        </div>
    )
  }

  return (
    <div className="space-y-6">
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
              {marketStats.volatilityIndex.toFixed(1)}
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