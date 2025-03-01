'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const TopPerformers = () => {
  const router = useRouter();
  const [performers, setPerformers] = useState({ top_performers: [], bottom_performers: [] });
  
  useEffect(() => {
    const fetchPerformers = async () => {
      const response = await fetch('http://localhost:8000/api/top-performers');
      const data = await response.json();
      setPerformers(data);
    };
    
    fetchPerformers();
    const interval = setInterval(fetchPerformers, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const PerformerRow = ({ stock }) => (
    <div 
      className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer border-b"
      onClick={() => router.push(`/graph/${encodeURIComponent(stock.player_tag)}`)}
    >
      <div>
        <div className="font-medium">{stock.player_tag}</div>
        <div className="text-sm text-gray-500">{stock.champion}</div>
      </div>
      <div className="text-right">
        <div className="font-medium">{stock.current_price.toFixed(2)}</div>
        <div className={stock.price_change_percent >= 0 ? 'text-green-600' : 'text-red-600'}>
          {stock.price_change_percent >= 0 ? '+' : ''}
          {stock.price_change_percent.toFixed(2)}%
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Top Performers</CardTitle>
        </CardHeader>
        <CardContent>
          {performers.top_performers.map((stock) => (
            <PerformerRow key={stock.player_tag} stock={stock} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Worst Performers</CardTitle>
        </CardHeader>
        <CardContent>
          {performers.bottom_performers.map((stock) => (
            <PerformerRow key={stock.player_tag} stock={stock} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default TopPerformers;