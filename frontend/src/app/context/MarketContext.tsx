'use client'

import { createContext, useState, useEffect, useContext, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthContext'

interface Market {
  id: number;
  name: string;
}

interface MarketContextType {
  userMarkets: Market[];
  currentMarket: Market | null;
  selectMarket: (market: Market) => void;
  refreshUserMarkets: () => Promise<void>;
  loading: boolean;
  initialized: boolean;
}

const MarketContext = createContext<MarketContextType | null>(null);

export const MarketProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [userMarkets, setUserMarkets] = useState<Market[]>([]);
  const [currentMarket, setCurrentMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // This is the function that fetches the data
  const fetchUserMarkets = useCallback(async () => {
    if (!user) {
      setUserMarkets([]);
      setCurrentMarket(null);
      setLoading(false);
      setInitialized(true);
      return;
    }

    // Only show loading on first initialization
    if (!initialized) {
      setLoading(true);
    }
    
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    try {
      const response = await fetch(`${API_URL}/api/users/${user.id}/markets`);
      if (!response.ok) throw new Error('API fetch failed with status: ' + response.status);
      
      const markets: Market[] = await response.json();
      setUserMarkets(markets);

      if (markets.length > 0) {
        const lastSelectedMarketId = localStorage.getItem('lastSelectedMarketId');
        const lastMarket = markets.find(m => m.id.toString() === lastSelectedMarketId);
        const newMarket = lastMarket || markets[0];
        setCurrentMarket(newMarket);
      } else {
        setCurrentMarket(null);
      }
    } catch (error) {
      console.error("[MarketContext] An error occurred in fetchUserMarkets:", error);
      setUserMarkets([]);
      setCurrentMarket(null);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [user]); // Remove 'initialized' to prevent dependency chain

  // This useEffect hook is the entry point. It runs when the user changes.
  useEffect(() => {
    if (authLoading) return;
    fetchUserMarkets();
  }, [user?.id, authLoading]); // Only depend on user ID and authLoading

  const selectMarket = useCallback((market: Market) => {
    setCurrentMarket(market);
    localStorage.setItem('lastSelectedMarketId', market.id.toString());
  }, []);

  // CRITICAL FIX: Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    userMarkets,
    currentMarket,
    selectMarket,
    refreshUserMarkets: fetchUserMarkets,
    loading,
    initialized,
  }), [userMarkets, currentMarket, selectMarket, fetchUserMarkets, loading, initialized]);

  return (
    <MarketContext.Provider value={value}>
      {children}
    </MarketContext.Provider>
  );
};

export const useMarket = () => {
  const context = useContext(MarketContext);
  if (context === null) {
    throw new Error('useMarket must be used within a MarketProvider');
  }
  return context;
};