'use client'

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useMarket } from '@/app/context/MarketContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/solid'; // Keeping your original icons

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// This interface matches the output of our new /api/markets/{id}/stocks endpoint
interface Stock {
  player_tag: string;
  champion: string;
  current_price: number;
  price_change_24h: number; // The raw change value
  price_change_percent_24h: number; // The percentage change
}

export default function GraphIndexPage() {
  const { currentMarket } = useMarket();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentMarket) {
        setLoading(false);
        setStocks([]);
        return;
    }

    const fetchStocks = async () => {
      // Only show loading state if we don't have any stocks data yet
      if (stocks.length === 0) {
        setLoading(true);
      }
      
      try {
        const response = await fetch(`${API_URL}/api/markets/${currentMarket.id}/stocks`);
        if (!response.ok) throw new Error('Failed to fetch stocks for this market');
        const data = await response.json();
        setStocks(data);
      } catch (error) {
        console.error('Error fetching stocks:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStocks();
  }, [currentMarket, stocks.length]);

  if (loading) {
      return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 p-8">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
        </div>
      );
  }

  if (!currentMarket) {
     return (
        <div className="text-center py-20">
            <h2 className="text-xl font-semibold">Please select a market to view its stocks.</h2>
        </div>
     );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Stock Charts</h1>
        <p className="text-gray-600">Select a stock from the "{currentMarket.name}" market to view its detailed chart.</p>
      </div>
      
      {stocks.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {stocks.map((stock) => (
                // IMPORTANT: The link now needs to pass champion info, we'll use a query parameter.
                <Link 
                    key={`${stock.player_tag}-${stock.champion}`}
                    href={`/graph/${encodeURIComponent(stock.player_tag)}?champion=${stock.champion}`}
                >
                    <Card className="hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between">
                            <span className="text-lg font-semibold truncate">{stock.player_tag}</span>
                            <span className={`text-sm px-3 py-1 rounded-full ${stock.price_change_percent_24h >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {stock.price_change_percent_24h >= 0 ? '+' : ''}{stock.price_change_percent_24h.toFixed(2)}%
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <img 
                                    src={`/champions/${stock.champion.toLowerCase()}.png`}
                                    alt={stock.champion}
                                    className="h-14 w-14 object-cover rounded-md"
                                    onError={(e) => { e.currentTarget.src = '/champions/default.png'; }}
                                />
                                <div>
                                    <p className="text-sm text-gray-500">Champion</p>
                                    <p className="font-medium text-gray-900">{stock.champion}</p>
                                </div>
                            </div>
                            <div className="flex justify-between items-end pt-1 border-t">
                                <div>
                                    <p className="text-sm text-gray-500">Current Price</p>
                                    <p className="text-xl font-bold text-gray-900">${stock.current_price.toFixed(2)}</p>
                                </div>
                                <div className={`flex items-center gap-1 ${stock.price_change_24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {stock.price_change_24h >= 0 ? <ArrowTrendingUpIcon className="h-5 w-5" /> : <ArrowTrendingDownIcon className="h-5 w-5" />}
                                    <span className="font-medium">${Math.abs(stock.price_change_24h).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    </Card>
                </Link>
            ))}
        </div>
      ) : (
         <div className="text-center py-20 bg-muted/50 rounded-lg">
            <h2 className="text-xl font-semibold">No Stocks in this Market</h2>
            <p className="text-muted-foreground mt-2">The market creator can add players on the management page.</p>
        </div>
      )}
    </div>
  );
}