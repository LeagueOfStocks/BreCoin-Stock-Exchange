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
  champions: string[];
  current_price: number;
  price_change_24h: number; // The raw change value
  price_change_percent_24h: number; // The percentage change
}

// Global singleton variables to prevent re-initialization during navigation
let hasGraphRenderedBefore = false;
let cachedGraphStocks: Stock[] = [];

export default function GraphIndexPage() {
  const { currentMarket, initialized: marketInitialized } = useMarket();
  const [stocks, setStocks] = useState<Stock[]>(cachedGraphStocks);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(hasGraphRenderedBefore);

  useEffect(() => {
    // Wait for market context to be initialized
    if (!marketInitialized) return;

    if (!currentMarket) {
        setLoading(false);
        setInitialized(true);
        setStocks([]);
        hasGraphRenderedBefore = true;
        return;
    }

    const fetchStocks = async () => {
      // Only show loading skeleton on first load when we have no data and haven't initialized
      if (!initialized && !hasGraphRenderedBefore) {
        setLoading(true);
      }
      
      try {
        const response = await fetch(`${API_URL}/api/markets/${currentMarket.id}/stocks`);
        if (!response.ok) throw new Error('Failed to fetch stocks for this market');
        const data = await response.json();
        setStocks(data);
        cachedGraphStocks = data;
      } catch (error) {
        console.error('Error fetching stocks:', error);
        if (!hasGraphRenderedBefore) {
          setStocks([]);
        }
      } finally {
        setLoading(false);
        setInitialized(true);
        hasGraphRenderedBefore = true;
      }
    };

    fetchStocks();
  }, [currentMarket?.id, marketInitialized]); // Remove 'initialized' from dependencies

  // Only show loading skeleton on initial load when market context is not ready
  if (!marketInitialized || (loading && !initialized && !hasGraphRenderedBefore)) {
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
                <Link 
                    key={stock.player_tag}
                    href={`/graph/${encodeURIComponent(stock.player_tag)}`}
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
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {stock.champions.map((champion, index) => (
                                        <img 
                                            key={champion}
                                            src={`/champions/${champion.toLowerCase()}.png`}
                                            alt={champion}
                                            className="h-12 w-12 object-cover rounded-md border-2 border-white shadow-sm"
                                            onError={(e) => { e.currentTarget.src = '/champions/default.png'; }}
                                        />
                                    ))}
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-gray-500">Champions</p>
                                    <p className="font-medium text-gray-900 text-sm">{stock.champions.join(', ')}</p>
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