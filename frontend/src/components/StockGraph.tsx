'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { useMarket } from '@/app/context/MarketContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarIcon } from '@heroicons/react/24/outline';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface StockGraphProps {
  playerTag: string;
  champion: string;
}

interface StockDataPoint { stock_value: number; timestamp: string; }
interface ModelScore { model_score: number; timestamp: string; stock_value: number; previous_stock_value: number | null; price_change: number; formatted_time: string; }

const StockGraph = ({ playerTag, champion }: StockGraphProps) => {
  const { currentMarket, initialized: marketInitialized } = useMarket();
  const [period, setPeriod] = useState('1w');
  const [history, setHistory] = useState<StockDataPoint[]>([]);
  const [scores, setScores] = useState<ModelScore[]>([]);
  const [loading, setLoading] = useState(false); // Start with false
  const [initialized, setInitialized] = useState(false); // Track initialization

  // Using useCallback to memoize the fetch function
  const fetchData = useCallback(async () => {
    // Wait for market context to be initialized
    if (!marketInitialized) return;

    // Wait until we have all the necessary pieces of information
    if (!currentMarket || !playerTag || !champion) {
        setLoading(false);
        setInitialized(true);
        return;
    };

    // Only show loading skeleton on first load when we have no data and haven't initialized
    if (!initialized && history.length === 0 && scores.length === 0) {
      setLoading(true);
    }
    
    try {
        const encodedPlayerTag = encodeURIComponent(playerTag); // Ensure tag is URL-safe

        // --- THIS IS THE CORRECTED URL CONSTRUCTION ---
        const historyUrl = `${API_URL}/api/markets/${currentMarket.id}/stocks/${encodedPlayerTag}/${champion}/history?period=${period}`;
        const scoresUrl = `${API_URL}/api/markets/${currentMarket.id}/stocks/${encodedPlayerTag}/${champion}/scores`;
        
        console.log("Fetching history from:", historyUrl); // Debug log
        console.log("Fetching scores from:", scoresUrl);   // Debug log

        const historyPromise = fetch(historyUrl);
        const scoresPromise = fetch(scoresUrl);

        const [historyResponse, scoresResponse] = await Promise.all([historyPromise, scoresPromise]);

        if (!historyResponse.ok) throw new Error(`Failed to fetch stock history (${historyResponse.status})`);
        if (!scoresResponse.ok) throw new Error(`Failed to fetch recent scores (${scoresResponse.status})`);

        const historyData = await historyResponse.json();
        const scoresData = await scoresResponse.json();

        setHistory(historyData || []); // Ensure we always have an array
        setScores(scoresData || []);   // Ensure we always have an array

    } catch (error) {
        console.error("Error fetching stock details:", error);
        setHistory([]); // Reset to empty on error
        setScores([]);  // Reset to empty on error
    } finally {
        setLoading(false);
        setInitialized(true);
    }
  }, [currentMarket, playerTag, champion, period, marketInitialized, initialized, history.length, scores.length]); // Correct dependency array

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Only show loading skeleton on initial load when market context is not ready
  if (!marketInitialized || (loading && !initialized)) {
    return <div className="space-y-4 p-8"><Skeleton className="h-48 w-full" /><Skeleton className="h-96 w-full" /></div>
  }

  if (!currentMarket) {
     return <div className="text-center py-20"><h2 className="text-xl font-semibold">Please select a market to view stock charts.</h2></div>
  }

  const currentPrice = history.length > 0 ? history[history.length - 1].stock_value : 0;
  const startPrice = history.length > 0 ? history[0].stock_value : 0;
  const priceChange = currentPrice - startPrice;
  const priceChangePercent = startPrice && startPrice > 0 ? (priceChange / startPrice) * 100 : 0;

  return (
    <div className="p-8 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center space-x-4">
            <img
              src={`/champions/${champion.toLowerCase()}.png`}
              alt={champion}
              className="w-20 h-20 rounded-lg object-cover shadow-xl"
              onError={(e) => { e.currentTarget.src = '/champions/default.png'; }}
            />
            <div>
                <CardTitle className="text-2xl">{playerTag}</CardTitle>
                <p className="text-lg text-muted-foreground">{champion}</p>
            </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><p className="text-sm text-gray-500">Current Price</p><p className="text-2xl font-bold">${currentPrice.toFixed(2)}</p></div>
            <div><p className="text-sm text-gray-500">Change ({period.toUpperCase()})</p><p className={`text-2xl font-bold ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>{priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}</p></div>
            <div><p className="text-sm text-gray-500">% Change ({period.toUpperCase()})</p><p className={`text-2xl font-bold ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>{priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Price History</CardTitle>
            <div className="flex gap-2">
                {['1d', '1w', '1m', 'ytd', 'all'].map(p => (<Button key={p} size="sm" variant={period === p ? 'default' : 'outline'} onClick={() => setPeriod(p)}>{p.toUpperCase()}</Button>))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-96 pt-6">
            {history.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history.map(d => ({...d, timestamp: new Date(d.timestamp).getTime()}))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts).toLocaleDateString()} type="number" domain={['dataMin', 'dataMax']} />
                        <YAxis domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(val) => `$${val.toFixed(1)}`} />
                        <Tooltip labelFormatter={(ts) => new Date(ts).toLocaleString()} formatter={(val: number) => [`$${val.toFixed(2)}`, 'Price']} />
                        <Line type="monotone" dataKey="stock_value" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground pt-16">No price history available for this period.</p>}
        </CardContent>
      </Card>
      
            <Card>
                <CardHeader><CardTitle>Recent Game Scores</CardTitle></CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {/* Add a check to ensure 'scores' is an array before mapping */}
                        {Array.isArray(scores) && scores.length > 0 ? (
                            scores.map((score, index) => {
                                // Provide default fallback values for every property
                                const modelScore = score?.model_score ?? 0;
                                const stockValue = score?.stock_value ?? 0;
                                const priceChange = score?.price_change ?? 0;
                                const timestamp = score?.timestamp ? new Date(score.timestamp).toLocaleString() : 'No date';

                                return (
                                    <div key={index} className="flex items-center p-3 rounded-lg border">
                                        <div className={`flex items-center justify-center h-10 w-10 rounded-full font-bold mr-4 ${modelScore >= 8 ? 'bg-green-100 text-green-800' : modelScore >= 6 ? 'bg-blue-100 text-blue-800' : modelScore >= 4 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                            {modelScore.toFixed(1)}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium">Game Score</div>
                                            <div className="text-sm text-gray-500 flex items-center mt-1">
                                                <CalendarIcon className="h-4 w-4 mr-1.5" />
                                                {timestamp}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold">${stockValue.toFixed(2)}</p>
                                            <p className={`text-sm font-medium ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        ) : <p className="text-center text-muted-foreground py-8">No recent game scores available.</p>}
                    </div>
                </CardContent>
            </Card>
    </div>
  );
};

export default StockGraph;