import MarketManagementPage from '@/components/pages/MarketManagementPage'

interface PageProps {
  params: {
    marketId: string
  }
}

export default function MarketManagementRoute({ params }: PageProps) {
  return <MarketManagementPage marketId={params.marketId} />
}