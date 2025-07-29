'use client'

import { useState, useEffect } from 'react';
import { useMarket } from '@/app/context/MarketContext';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Star, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Performer {
    player_tag: string;
    champion: string;
    current_price: number;
    price_change_percent: number;
}

// Reusable component for displaying a single performer row
const PerformerRow = ({ stock, rank, marketId }: { stock: Performer, rank: number, marketId: number }) => {
    const router = useRouter();
    return (
        <div 
          className="flex items-center justify-between py-4 px-2 hover:bg-muted/50 cursor-pointer rounded-lg transition-colors duration-200"
          onClick={() => router.push(`/market/${marketId}/stocks/${encodeURIComponent(stock.player_tag)}/${stock.champion}`)}
        >
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 font-bold">{rank}</div>
            <div>
              <div className="font-medium flex items-center">
                {stock.player_tag.split('#')[0]}
                {rank === 1 && <Star className="h-4 w-4 ml-1 text-yellow-400 fill-yellow-400" />}
              </div>
              <div className="text-sm text-muted-foreground flex items-center">
                <Badge variant="outline" className="mr-1">{stock.champion}</Badge>
                <span className="text-xs">${stock.current_price.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="text-right flex items-center space-x-2">
            <div className="flex items-center space-x-1 text-sm font-semibold">
              {stock.price_change_percent >= 0 ? 
                <ArrowUpRight className="h-4 w-4 text-green-600" /> : 
                <ArrowDownRight className="h-4 w-4 text-red-600" />
              }
              <span className={stock.price_change_percent >= 0 ? 'text-green-600' : 'text-red-600'}>
                {stock.price_change_percent >= 0 ? '+' : ''}
                {stock.price_change_percent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
    );
};


export default function TopPerformersPage() {
    const { currentMarket, initialized: marketInitialized } = useMarket();
    const [performers, setPerformers] = useState<{ top_performers: Performer[], bottom_performers: Performer[] }>({ top_performers: [], bottom_performers: [] });
    const [timeframe, setTimeframe] = useState('1m'); // Corresponds to 'month'
    const [loading, setLoading] = useState(false); // Start with false
    const [initialized, setInitialized] = useState(false); // Track initialization

    useEffect(() => {
        // Wait for market context to be initialized
        if (!marketInitialized) return;

        if (!currentMarket) {
            setLoading(false);
            setInitialized(true);
            setPerformers({ top_performers: [], bottom_performers: [] });
            return;
        }

        const fetchPerformers = async () => {
            // Only show loading on first initialization
            if (!initialized && performers.top_performers.length === 0 && performers.bottom_performers.length === 0) {
                setLoading(true);
            }
            
            try {
                // Pass the timeframe to our new, more powerful endpoint
                const response = await fetch(`${API_URL}/api/markets/${currentMarket.id}/performers?period=${timeframe}`);
                if (!response.ok) throw new Error("Failed to fetch performers");
                const data = await response.json();
                
                if (data && data.top_performers) {
                    setPerformers(data);
                } else {
                    setPerformers({ top_performers: [], bottom_performers: [] });
                }

            } catch (error) {
                console.error('Error fetching performers:', error);
            } finally {
                setLoading(false);
                setInitialized(true);
            }
        };

        fetchPerformers();
    }, [currentMarket, timeframe, marketInitialized, initialized, performers.top_performers.length, performers.bottom_performers.length]); // Re-fetch when timeframe changes

    // Only show loading skeleton on initial load when market context is not ready
    if (!marketInitialized || (loading && !initialized)) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Skeleton className="h-96" />
                <Skeleton className="h-96" />
            </div>
        );
    }

    if (!currentMarket) {
        return <div className="text-center py-20"><h2 className="text-xl font-semibold">Please select a market to view performers.</h2></div>
    }

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight mb-2">Market Movers</h1>
                <p className="text-gray-500 text-lg">Best and worst performing stocks in the "{currentMarket.name}" market.</p>
            </div>
      
            <Tabs defaultValue="1m" className="mb-8" onValueChange={setTimeframe}>
                <TabsList>
                    <TabsTrigger value="1d"><Clock className="h-4 w-4 mr-1" />24h</TabsTrigger>
                    <TabsTrigger value="1w">7 Days</TabsTrigger>
                    <TabsTrigger value="1m">30 Days</TabsTrigger>
                    <TabsTrigger value="ytd">Year to Date</TabsTrigger>
                </TabsList>
            </Tabs>
      
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader><CardTitle className="flex items-center"><TrendingUp className="h-5 w-5 mr-2 text-green-500" /> Top Performers</CardTitle></CardHeader>
                    <CardContent>
                        {performers.top_performers.length > 0 ? (
                            performers.top_performers.map((stock, i) => (
                                <PerformerRow key={`${stock.player_tag}-${stock.champion}`} stock={stock} rank={i + 1} marketId={currentMarket.id} />
                            ))
                        ) : <p className="text-center text-muted-foreground py-8">No performance data available for this period.</p>}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="flex items-center"><TrendingDown className="h-5 w-5 mr-2 text-red-500" /> Bottom Performers</CardTitle></CardHeader>
                    <CardContent>
                        {performers.bottom_performers.length > 0 ? (
                            [...performers.bottom_performers].sort((a,b) => a.price_change_percent - b.price_change_percent).map((stock, i) => (
                                 <PerformerRow key={`${stock.player_tag}-${stock.champion}`} stock={stock} rank={i + 1} marketId={currentMarket.id} />
                            ))
                        ) : <p className="text-center text-muted-foreground py-8">No performance data available for this period.</p>}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}