'use client'

import { useParams } from 'next/navigation'
import StockGraph from '@/components/StockGraph'

export default function GraphDetailPage() {
  const params = useParams()
  const id = params.id as string
  
  if (!id) return <div>No stock selected</div>
  
  return (
    <div className="min-h-screen">
      <StockGraph stockId={id} />
    </div>
  )
}