'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Star, Clock } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const TopPerformers = () => {
  const router = useRouter();
  const [performers, setPerformers] = useState({ 
    top_performers: [], 
    bottom_performers: [] 
  });
  const [timeframe, setTimeframe] = useState('month');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchPerformers = async () => {
      // Only show loading state on initial load when we have no data
      if (performers.top_performers.length === 0 && performers.bottom_performers.length === 0) {
        setLoading(true);
      }
      
      try {
        const response = await fetch(`${API_URL}/api/top-performers?period=${timeframe}`);
        const data = await response.json();
        setPerformers(data);
      } catch (error) {
        console.error('Error fetching performers:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPerformers();
    const interval = setInterval(fetchPerformers, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [timeframe, performers.top_performers.length, performers.bottom_performers.length]);

  const PerformerRow = ({ stock, rank }) => (
    <div 
      className="flex items-center justify-between py-4 px-2 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer rounded-lg transition-colors duration-200 mb-2"
      onClick={() => router.push(`/graph/${encodeURIComponent(stock.player_tag)}`)}
    >
      <div className="flex items-center space-x-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
          {rank}
        </div>
        <div>
          <div className="font-medium flex items-center">
            {stock.player_tag.split('#')[0]}
            {rank === 1 && <Star className="h-4 w-4 ml-1 text-yellow-400 fill-yellow-400" />}
          </div>
          <div className="text-sm text-gray-500 flex items-center">
            <Badge variant="outline" className="mr-1">{stock.champion}</Badge>
            <span className="text-xs">${stock.current_price.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div className="text-right flex items-center space-x-2">
        <div className={`px-3 py-1 rounded-full ${
          stock.price_change_percent >= 5 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
          stock.price_change_percent >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' :
          stock.price_change_percent >= -5 ? 'bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-200' :
          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
        }`}>
          <div className="flex items-center space-x-1">
            {stock.price_change_percent >= 0 ? 
              <ArrowUpRight className="h-3 w-3" /> : 
              <ArrowDownRight className="h-3 w-3" />
            }
            <span className="text-sm font-medium">
              {stock.price_change_percent >= 0 ? '+' : ''}
              {stock.price_change_percent.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const PerformerSkeleton = () => (
    <div className="flex items-center justify-between py-4 px-2 mb-2">
      <div className="flex items-center space-x-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div>
          <Skeleton className="h-5 w-32 mb-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <Skeleton className="h-8 w-20 rounded-full" />
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Market Leaders</h1>
        <p className="text-gray-500 text-lg">Track the best and worst performing stocks</p>
      </div>
      
      <Tabs defaultValue="month" className="mb-8" onValueChange={setTimeframe}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="day">
              <Clock className="h-4 w-4 mr-1" />
              24h
            </TabsTrigger>
            <TabsTrigger value="week">7 Days</TabsTrigger>
            <TabsTrigger value="month">30 Days</TabsTrigger>
            <TabsTrigger value="ytd">Year to Date</TabsTrigger>
          </TabsList>
          <div className="text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </Tabs>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="border-t-4 border-t-green-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2 text-green-500" />
                  Top Performers
                </CardTitle>
                <CardDescription>Best performing players this {timeframe}</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-green-50 text-green-800 hover:bg-green-100">Gainers</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              Array(5).fill(0).map((_, i) => <PerformerSkeleton key={i} />)
            ) : (
              performers.top_performers.map((stock, i) => (
                <PerformerRow key={stock.player_tag} stock={stock} rank={i + 1} />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-red-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center">
                  <TrendingDown className="h-5 w-5 mr-2 text-red-500" />
                  Worst Performers
                </CardTitle>
                <CardDescription>Struggling players this {timeframe}</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-red-50 text-red-800 hover:bg-red-100">Losers</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              Array(5).fill(0).map((_, i) => <PerformerSkeleton key={i} />)
            ) : (
              // Sort bottom performers by price change from most negative to least negative
              [...performers.bottom_performers]
                .sort((a, b) => a.price_change_percent - b.price_change_percent)
                .map((stock, i) => (
                  <PerformerRow key={stock.player_tag} stock={stock} rank={i + 1} />
                ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TopPerformers;