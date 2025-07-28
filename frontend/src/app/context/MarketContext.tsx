'use client'

import { createContext, useState, useEffect, useContext, useCallback } from 'react'
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
}

const MarketContext = createContext<MarketContextType | null>(null);

export const MarketProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const router = useRouter();
  const [userMarkets, setUserMarkets] = useState<Market[]>([]);
  const [currentMarket, setCurrentMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);

  // This is the function that fetches the data
  const fetchUserMarkets = useCallback(async () => {
    // --- STEP 2 ---
    console.log("[MarketContext] fetchUserMarkets called. Current user:", user?.id);

    if (!user) {
      console.log("[MarketContext] No user found. Resetting state and stopping.");
      setUserMarkets([]);
      setCurrentMarket(null);
      setLoading(false); // We are no longer loading
      return;
    }

    setLoading(true);
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    try {
      // --- STEP 3 ---
      console.log(`[MarketContext] Fetching from API: ${API_URL}/api/users/${user.id}/markets`);
      const response = await fetch(`${API_URL}/api/users/${user.id}/markets`);
      if (!response.ok) throw new Error('API fetch failed with status: ' + response.status);
      
      const markets: Market[] = await response.json();
      // --- STEP 4 ---
      console.log("[MarketContext] API Response OK. Markets received:", markets);

      setUserMarkets(markets);

      if (markets.length > 0) {
        const lastSelectedMarketId = localStorage.getItem('lastSelectedMarketId');
        const lastMarket = markets.find(m => m.id.toString() === lastSelectedMarketId);
        const newMarket = lastMarket || markets[0];
        setCurrentMarket(newMarket);
        // --- STEP 5 (Path A) ---
        console.log("[MarketContext] Setting state: loading=false, currentMarket=", newMarket);
      } else {
        setCurrentMarket(null);
        // --- STEP 5 (Path B) ---
        console.log("[MarketContext] Setting state: loading=false, currentMarket=null");
      }
    } catch (error) {
      console.error("[MarketContext] An error occurred in fetchUserMarkets:", error);
      setUserMarkets([]);
      setCurrentMarket(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // This useEffect hook is the entry point. It runs when the `user` object changes.
  useEffect(() => {
    // --- STEP 1 ---
    console.log("[MarketContext] useEffect triggered. User has changed.", { user_id: user?.id });
    fetchUserMarkets();
  }, [user, fetchUserMarkets]);

  const selectMarket = (market: Market) => {
    setCurrentMarket(market);
    localStorage.setItem('lastSelectedMarketId', market.id.toString());
  };

  const value = {
    userMarkets,
    currentMarket,
    selectMarket,
    refreshUserMarkets: fetchUserMarkets,
    loading,
  };

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