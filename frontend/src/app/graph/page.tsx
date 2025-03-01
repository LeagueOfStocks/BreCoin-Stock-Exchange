'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/solid'

interface Stock {
  player_tag: string
  champion: string
  current_price: number
  price_change: number
  price_change_percent: number
}

export default function GraphIndexPage() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/stocks')
        if (!response.ok) throw new Error('Failed to fetch stocks')
        const data = await response.json()
        setStocks(data)
      } catch (error) {
        console.error('Error fetching stocks:', error)
        setError('Failed to load stocks')
      } finally {
        setLoading(false)
      }
    }

    fetchStocks()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"/>
    </div>
  )
  
  if (error) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-red-500 bg-red-50 px-4 py-3 rounded-lg shadow-sm">
        {error}
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Player Stock Market</h1>
        <p className="text-gray-600">Select a player's champion to view detailed performance metrics</p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {stocks.map((stock) => (
          <Link 
            key={`${stock.player_tag}-${stock.champion}`}
            href={`/graph/${encodeURIComponent(stock.player_tag)}`}
          >
            <Card className="hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span className="text-lg font-semibold">{stock.player_tag}</span>
                  <span className={`text-sm px-3 py-1 rounded-full ${
                    stock.price_change >= 0 
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {stock.price_change >= 0 ? '+' : ''}{stock.price_change_percent.toFixed(2)}%
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-lg hover:scale-105 flex items-center justify-center overflow-hidden">
                      <img 
                        src={`/champions/${stock.champion.toLowerCase()}.png`}
                        alt={stock.champion}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Champion</p>
                      <p className="font-medium text-gray-900">{stock.champion}</p>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-end pt-1 border-t border-gray-100">
                    <div>
                      <p className="text-sm text-gray-500">Current Price</p>
                      <p className="text-xl font-bold text-gray-900">
                        ${stock.current_price.toFixed(2)}
                      </p>
                    </div>
                    <div className={`flex items-center gap-1 ${
                      stock.price_change >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stock.price_change >= 0 
                        ? <ArrowTrendingUpIcon className="h-5 w-5" />
                        : <ArrowTrendingDownIcon className="h-5 w-5" />
                      }
                      <span className="font-medium">${Math.abs(stock.price_change).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}