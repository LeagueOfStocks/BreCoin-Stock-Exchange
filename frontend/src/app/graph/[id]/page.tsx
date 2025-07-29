'use client'

import StockGraph from "@/components/StockGraph";
import { useParams, useSearchParams } from "next/navigation";

export default function StockDetailPage() {
    const params = useParams();
    const searchParams = useSearchParams();

    // The 'id' from the folder name corresponds to the player tag
    const playerTag = params.id as string;
    // We get the champion from the query parameter
    const champion = searchParams.get('champion');

    // Handle cases where the URL might be incomplete
    if (!playerTag || !champion) {
        return (
            <div className="text-center p-8">
                <h2 className="text-xl font-semibold">Invalid Stock Information</h2>
                <p className="text-muted-foreground">Could not find player or champion in the URL.</p>
            </div>
        );
    }

    return (
        <StockGraph 
            playerTag={decodeURIComponent(playerTag)} 
            champion={champion}
        />
    );
}