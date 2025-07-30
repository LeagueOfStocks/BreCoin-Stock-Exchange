'use client'

import { useMarket } from "@/app/context/MarketContext"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Settings } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

export default function MarketSelector() {
    const { userMarkets, currentMarket, selectMarket, loading, initialized } = useMarket()

    // We are in the initial loading phase.
    if (!initialized || loading) {
        return <Skeleton className="w-48 h-10" />
    }

    // Loading is finished, and there is NO current market.
    if (!currentMarket) {
        return (
            <Link href="/selector_lobby">
                <Button>
                    Create or Join a Market
                </Button>
            </Link>
        )
    }

    // Loading is finished, and there IS a current market.
    return (
        <div className="flex items-center space-x-2">
            <Select
                value={currentMarket.id.toString()}
                onValueChange={(marketId) => {
                    const market = userMarkets.find(m => m.id.toString() === marketId)
                    if (market) selectMarket(market)
                }}
            >
                <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select a market" />
                </SelectTrigger>
                <SelectContent>
                    {userMarkets.map((market) => (
                        <SelectItem key={market.id} value={market.id.toString()}>
                            {market.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            
            {/* Settings/Management button that appears only for the current market */}
            <Link href={`/market/${currentMarket.id}`}>
                <Button variant="outline" size="icon">
                    <Settings className="h-4 w-4" />
                </Button>
            </Link>
        </div>
    )
} 