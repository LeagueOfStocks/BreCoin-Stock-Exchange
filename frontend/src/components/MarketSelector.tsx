'use client'

import { useMarket } from "@/app/context/MarketContext"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Settings } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

export default function MarketSelector() {
    const { userMarkets, currentMarket, selectMarket, loading } = useMarket()

    // --- Add console log to see EVERY render ---
    console.log("MarketSelector rendering with state:", { loading, currentMarket: currentMarket, marketCount: userMarkets.length });

    // Condition 1: We are in the initial loading phase.
    if (loading) {
        return <Skeleton className="w-48 h-10" />
    }

    // Condition 2: Loading is finished, and there is NO current market.
    // This is the state for a new user or a user with no markets.
    if (!currentMarket) {
        return (
            <Link href="/selector_lobby">
                <Button>
                    Create or Join a Market
                </Button>
            </Link>
        )
    }

    // Condition 3: Loading is finished, and there IS a current market.
    // This is the state for an existing user.
    return (
        <div className="flex items-center gap-2">
            <Select
                value={currentMarket.id.toString()}
                onValueChange={(marketId) => {
                    const selected = userMarkets.find(m => m.id.toString() === marketId)
                    if (selected) {
                        selectMarket(selected)
                    }
                }}
            >
                <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select a market..." />
                </SelectTrigger>
                <SelectContent>
                    {userMarkets.map(market => (
                        <SelectItem key={market.id} value={market.id.toString()}>
                            {market.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            
            <Link href={`/market/${currentMarket.id}`} passHref>
                <Button variant="ghost" size="icon" aria-label="Market Settings">
                    <Settings className="h-4 w-4" />
                </Button>
            </Link>
        </div>
    )
}