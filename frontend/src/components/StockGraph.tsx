import React from 'react';
import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarIcon, TrophyIcon } from '@heroicons/react/24/outline'; // Add this import

interface StockGraphProps {
  stockId: string
}

interface StockData {
  value: number
  timestamp: number
  game_id: string
}

interface ChampionInfo {
  playerTag: string
  champion: string
}

// Add to your interfaces
interface ModelScore {
  score: number;
  timestamp: number;
  formatted_time: string;
  game_id: string;
  stock_value: number;
  previous_stock_value: number;
  price_change: number;
}

interface ScoresResponse {
  player_tag: string;
  summoner_name: string;
  champion: string;
  scores: ModelScore[];
}

const StockGraph = ({ stockId }: StockGraphProps) => {
  const [period, setPeriod] = useState('1w');
  const [stockData, setStockData] = useState<StockData[]>([]);
  const [championInfo, setChampionInfo] = useState<ChampionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Add this state for model scores
  const [recentScores, setRecentScores] = useState<ModelScore[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);

  // Helper function to parse various datetime formats
  const parseDateTime = (dateStr: string): Date => {
    let date: Date;
    
    // Try ISO format first (new format)
    date = new Date(dateStr);
    
    // If invalid, try the old format
    if (isNaN(date.getTime())) {
      const [datePart, timePart] = dateStr.split(' ');
      const [year, month, day] = datePart.split('-');
      const [hours, minutes, seconds] = timePart.split(':');
      const [secs, ms] = seconds.split('.');
      
      date = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hours),
        parseInt(minutes),
        parseInt(secs),
        parseInt(ms || '0')
      );
    }
    
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
    
    return date;
  };
  
  useEffect(() => {
    if (!stockId) return;
    
    const fetchStockData = async () => {
      setLoading(true);
      setError(null);
      
      const decodedId = decodeURIComponent(stockId);
      const properlyEncodedId = encodeURIComponent(decodedId);
      
      try {
        // Fetch champion info first
        const championResponse = await fetch(`http://localhost:8000/api/stocks`);
        const allStocks = await championResponse.json();
        const currentStock = allStocks.find((stock: any) => stock.player_tag === decodedId);
        
        if (currentStock) {
          setChampionInfo({
            playerTag: currentStock.player_tag,
            champion: currentStock.champion
          });
        }
        
        // Fetch stock data
        const url = `http://localhost:8000/api/stocks/${properlyEncodedId}?period=${period}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0) {
          setError('No data available for this time period');
          setStockData([]);
        } else {
          // Process the data to ensure proper timestamp handling
          const processedData = data.map((item: any) => ({
            ...item,
            timestamp: typeof item.timestamp === 'number' 
              ? item.timestamp 
              : parseDateTime(item.timestamp).getTime()
          }));
          setStockData(processedData);
          setError(null);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to fetch data');
        setStockData([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStockData();
  }, [stockId, period]);

  // Add to your existing useEffect or create a new one
  useEffect(() => {
    if (!stockId) return;
    
    const fetchRecentScores = async () => {
      setScoresLoading(true);
      
      const decodedId = decodeURIComponent(stockId);
      const properlyEncodedId = encodeURIComponent(decodedId);
      
      try {
        const url = `http://localhost:8000/api/stocks/${properlyEncodedId}/scores`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: ScoresResponse = await response.json();
        setRecentScores(data.scores || []);
      } catch (error) {
        console.error('Error fetching recent scores:', error);
      } finally {
        setScoresLoading(false);
      }
    };
    
    fetchRecentScores();
  }, [stockId]);

  const getYAxisDomain = () => {
    if (stockData.length === 0) return [0, 60];
    
    const minPrice = Math.min(...stockData.map(d => d.value));
    const maxPrice = Math.max(...stockData.map(d => d.value));
    const priceRange = maxPrice - minPrice;
    
    // Different padding percentages based on time period
    const getPaddingPercent = () => {
      switch (period) {
        case '1d':
          return 0.1;  // 10% padding for daily view
        case '1w':
          return 0.1;  // 10% padding for weekly view
        case '1m':
          return 0.15; // 15% padding for monthly view
        case 'ytd':
        case 'all':
          return 0.4;  // 20% padding for long term views
        default:
          return 0.1;
      }
    };
    
    const padding = priceRange * getPaddingPercent();
    
    return [
      Math.max(0, minPrice - padding),
      maxPrice + padding
    ];
  };

  // Keep this for initial loading only
  if (loading && !stockData.length) return <div className="p-8">Loading stock data...</div>;
  
  const currentPrice = stockData.length > 0 ? stockData[stockData.length - 1]?.value : 0;
  const startPrice = stockData.length > 0 ? stockData[0]?.value : 0;
  const priceChange = currentPrice - startPrice;
  const priceChangePercent = startPrice ? (priceChange / startPrice) * 100 : 0;
  const yAxisDomain = getYAxisDomain();

  // Add this below the chart component in your render
  const renderRecentScores = () => {
    if (scoresLoading) {
      return (
        <div className="flex justify-center items-center h-24">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        </div>
      );
    }
    
    if (!recentScores || recentScores.length === 0) {
      return (
        <div className="text-center py-6 text-gray-500">
          No recent game scores available
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Recent Game Scores</h3>
          <div className="text-sm text-gray-500">Last {recentScores.length} games</div>
        </div>
        
        <div className="grid grid-cols-1 gap-3">
          {recentScores.map((score, index) => (
            <div 
              key={index}
              className="flex items-center p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-50 text-blue-600 font-bold mr-3">
                {(score.score ?? 0).toFixed(1)}
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">
                  Game Score
                  <span className={`ml-2 px-2 py-1 text-xs rounded-md ${
                    score.score >= 8 ? 'bg-green-100 text-green-800' : 
                    score.score >= 6 ? 'bg-blue-100 text-blue-800' : 
                    score.score >= 4 ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-red-100 text-red-800'
                  }`}>
                    {score.score >= 8 ? 'Excellent' : 
                     score.score >= 6 ? 'Good' : 
                     score.score >= 4 ? 'Average' : 
                     'Poor'}
                  </span>
                </div>
                <div className="text-sm text-gray-500 flex items-center mt-1">
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {score.formatted_time}
                  <span className="mx-2">•</span>
                  <span>Price: ${score.stock_value.toFixed(2)}</span>
                </div>
              </div>
              <div className={`text-sm font-medium ${
                score.price_change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {score.price_change >= 0 ? '+$' : '-$'}
                {Math.abs(score.price_change).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-8">
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center space-x-4">
          {championInfo && (
            <img
              src={`/champions/${championInfo.champion.toLowerCase()}.png`}
              alt={championInfo.champion}
              className="w-20 h-20 rounded-lg object-cover shadow-xl hover:scale-105 transition-shadow"
              onError={(e) => {
                e.currentTarget.src = '/champions/default.png';
                e.currentTarget.onerror = null;
              }}
            />
          )}
          <div>
            <CardTitle>{decodeURIComponent(stockId).split('#')[0]}</CardTitle>
            {championInfo && (
              <p className="text-sm text-gray-500">{championInfo.champion}</p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-500">Current Price</div>
              <div className="text-2xl font-bold">
                {currentPrice ? currentPrice.toFixed(2) : "N/A"}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Change</div>
              <div className={`text-2xl font-bold ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {!isNaN(priceChange) ? `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}` : "N/A"}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Change %</div>
              <div className={`text-2xl font-bold ${priceChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {!isNaN(priceChangePercent) ? `${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%` : "N/A"}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2 mb-6">
            {['1d', '1w', '1m', 'ytd', 'all'].map((p) => (
              <Button
                key={p}
                onClick={() => setPeriod(p)}
                variant={period === p ? 'default' : 'outline'}
              >
                {p.toUpperCase()}
              </Button>
            ))}
          </div>
          
          <div className="h-96">
            {loading && (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
              </div>
            )}
            
            {!loading && error && (
              <div className="flex items-center justify-center h-full border border-gray-200 rounded-lg bg-gray-50">
                <div className="text-red-500 p-4 text-center">
                  <p className="font-medium">{error}</p>
                  <p className="mt-2 text-sm text-gray-600">Try selecting a different time period</p>
                </div>
              </div>
            )}
            
            {!loading && !error && stockData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stockData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp"
                    tickFormatter={(timestamp) => new Date(timestamp).toLocaleDateString()}
                  />
                  <YAxis 
                    domain={yAxisDomain}
                    tickFormatter={(value) => value.toFixed(1)}
                  />
                  <Tooltip
                    labelFormatter={(timestamp) => new Date(timestamp).toLocaleString()}
                    formatter={(value) => [`${value.toFixed(2)}`, 'Price']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            
            {!loading && !error && stockData.length === 0 && (
              <div className="flex items-center justify-center h-full border border-gray-200 rounded-lg bg-gray-50">
                <div className="text-gray-500 p-4 text-center">
                  <p className="font-medium">No data available for this time period</p>
                  <p className="mt-2 text-sm text-gray-600">Try selecting a different time period</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Add this right below the existing card */}
      <Card>
        <CardContent className="pt-6">
          {renderRecentScores()}
        </CardContent>
      </Card>
    </div>
  );
};

export default StockGraph;