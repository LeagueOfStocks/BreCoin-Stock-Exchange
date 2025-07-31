'use client'

import StockGraph from "@/components/features/stocks/StockGraph";
import { useParams } from "next/navigation";

export default function StockDetailPage() {
    const params = useParams();

    // The 'id' from the folder name corresponds to the player tag
    const playerTag = params.id as string;

    // Handle cases where the URL might be incomplete
    if (!playerTag) {
        return (
            <div className="text-center p-8">
                <h2 className="text-xl font-semibold">Invalid Stock Information</h2>
                <p className="text-muted-foreground">Could not find player in the URL.</p>
            </div>
        );
    }

    return (
        <StockGraph 
            playerTag={decodeURIComponent(playerTag)} 
        />
    );
}