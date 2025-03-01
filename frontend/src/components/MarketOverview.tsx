'use client'

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const MarketOverview = () => {
  const [stocks, setStocks] = useState([]);
  const [marketStats, setMarketStats] = useState({
    totalValue: 0,
    averagePrice: 0,
    topGainer: null,
    topLoser: null,
    volatilityIndex: 0
  });
  const router = useRouter();

  const calculateVolatility = (volatilityData) => {
    if (!volatilityData || volatilityData.length === 0) return 0;
    
    const absoluteDailyChanges = volatilityData.map(stock => Math.abs(stock.daily_change));
    const totalMovement = absoluteDailyChanges.reduce((sum, change) => sum + change, 0);
    const mean = absoluteDailyChanges.reduce((sum, change) => sum + change, 0) / absoluteDailyChanges.length;
    const variance = absoluteDailyChanges.reduce((sum, change) => {
      const diff = change - mean;
      return sum + (diff * diff);
    }, 0) / absoluteDailyChanges.length;
    
    const standardDeviation = Math.sqrt(variance);
    const volatilityScore = (
      (totalMovement * 0.5) +
      (standardDeviation * 10 * 0.3) +
      (mean * 15 * 0.2)
    );
    
    return Math.min(40, Math.max(0, volatilityScore));
  };
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get both stocks and volatility data
        const [stocksResponse, volatilityResponse] = await Promise.all([
          fetch('http://localhost:8000/api/stocks'),
          fetch('http://localhost:8000/api/market-volatility')
        ]);
        
        const [stocksData, volatilityData] = await Promise.all([
          stocksResponse.json(),
          volatilityResponse.json()
        ]);
        
        // Create a map of daily changes
        const dailyChangesMap = volatilityData.reduce((acc, item) => {
          acc[item.player_tag] = item.daily_change;
          return acc;
        }, {});
        
        // Combine stocks data with daily changes
        const combinedStocksData = stocksData.map(stock => ({
          ...stock,
          daily_change: dailyChangesMap[stock.player_tag] || 0,
          daily_change_percent: (dailyChangesMap[stock.player_tag] / stock.current_price * 100) || 0
        }));
        
        setStocks(combinedStocksData);
        
        // Calculate market statistics
        const totalValue = combinedStocksData.reduce((sum, stock) => sum + stock.current_price, 0);
        const avgPrice = totalValue / combinedStocksData.length;
        const topGainer = combinedStocksData.reduce((prev, curr) => 
          (curr.daily_change_percent > (prev?.daily_change_percent || -Infinity)) ? curr : prev, null);
        const topLoser = combinedStocksData.reduce((prev, curr) => 
          (curr.daily_change_percent < (prev?.daily_change_percent || Infinity)) ? curr : prev, null);
        
        const volatility = calculateVolatility(volatilityData);
        
        setMarketStats({
          totalValue,
          averagePrice: avgPrice,
          topGainer,
          topLoser,
          volatilityIndex: volatility
        });
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);
    
  const getVolatilityColor = (volatility) => {
    if (volatility < 8) return 'text-green-500';
    if (volatility < 15) return 'text-yellow-500';
    if (volatility < 25) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Market Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Market Overview</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${marketStats.totalValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Total Market Value</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Daily Gainer</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{marketStats.topGainer?.player_tag || 'N/A'}</div>
            <p className="text-xs text-green-500">
              {marketStats.topGainer ? 
                `+${marketStats.topGainer.daily_change_percent.toFixed(2)}%` : 
                'No data'}
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
            <p className="text-xs text-muted-foreground">Volatility Index</p>
          </CardContent>
        </Card>
      </div>

      {/* Stock Table */}
      <Card className="bg-white rounded-lg shadow">
        <CardHeader>
          <CardTitle>Market Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Champion</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Change (24h)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Change (24h) %</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Change (7d)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Change (7d) %</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stocks.map((stock) => (
                  <tr 
                    key={stock.player_tag}
                    onClick={() => router.push(`/graph/${encodeURIComponent(stock.player_tag)}`)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{stock.player_tag}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{stock.champion}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      ${stock.current_price.toFixed(2)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
                      stock.daily_change >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stock.daily_change >= 0 ? '+' : ''}{stock.daily_change.toFixed(2)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
                      stock.daily_change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stock.daily_change_percent >= 0 ? '+' : ''}
                      {stock.daily_change_percent.toFixed(2)}%
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
                      stock.price_change >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stock.price_change >= 0 ? '+' : ''}{stock.price_change.toFixed(2)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
                      stock.price_change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stock.price_change_percent >= 0 ? '+' : ''}
                      {stock.price_change_percent.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      {stock.daily_change >= 0 ? (
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