'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'
import { useAuth } from '@/app/context/AuthContext'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

// Define types for our data for type safety
interface Holding {
  player_tag: string;
  champion: string;
  current_shares: number;
}

interface Transaction {
  created_at: string;
  transaction_type: 'BUY' | 'SELL';
  player_tag: string;
  champion: string;
  shares: number;
  price_per_share: number;
  total_amount: number;
}

export default function PortfolioPage() {
  const { user } = useAuth()
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [gold, setGold] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const fetchData = async () => {
      setLoading(true)

      // Fetch user's gold from their profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('gold')
        .eq('id', user.id)
        .single()
      
      if (profileData) setGold(profileData.gold)

      // Fetch current holdings from our portfolio VIEW
      const { data: holdingsData, error: holdingsError } = await supabase
        .from('portfolio_view')
        .select('*')
        .eq('user_id', user.id)

      if (holdingsData) setHoldings(holdingsData)

      // Fetch the last 10 transactions
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (transactionsData) setTransactions(transactionsData as Transaction[])

      setLoading(false)
    }

    fetchData()
  }, [user])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your Portfolio</h1>
        <p className="text-muted-foreground">An overview of your current assets and trading activity.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Available Gold</CardTitle>
            <CardDescription>Your cash balance ready for trading.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{gold.toFixed(2)} Gold</p>
          </CardContent>
        </Card>
        {/* We will add Portfolio Value and P/L cards here later once we calculate them */}
      </div>

      {/* Holdings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Current Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                {/* We'll add more columns like Market Value later */}
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.length > 0 ? (
                holdings.map((holding) => (
                  <TableRow key={`${holding.player_tag}-${holding.champion}`}>
                    <TableCell>
                      <div className="font-medium">{holding.player_tag}</div>
                      <div className="text-sm text-muted-foreground">{holding.champion}</div>
                    </TableCell>
                    <TableCell className="text-right">{holding.current_shares}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} className="text-center">You do not currently hold any stocks.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Transaction History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length > 0 ? (
                transactions.map((tx) => (
                  <TableRow key={tx.created_at}>
                    <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <span className={tx.transaction_type === 'BUY' ? 'text-green-500' : 'text-red-500'}>
                        {tx.transaction_type}
                      </span>
                    </TableCell>
                    <TableCell>{tx.player_tag}</TableCell>
                    <TableCell className="text-right">{tx.shares}</TableCell>
                    <TableCell className="text-right">${tx.price_per_share.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{tx.total_amount.toFixed(2)} Gold</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">You have no transaction history.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}