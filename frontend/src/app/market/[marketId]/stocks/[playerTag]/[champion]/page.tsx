import StockGraph from "@/components/StockGraph"; // <-- Import the component

interface PageProps {
    params: {
        marketId: string;
        playerTag: string;
        champion: string;
    }
}

export default function StockDetailPage({ params }: PageProps) {
    const { marketId, playerTag, champion } = params;
    const decodedPlayerTag = decodeURIComponent(playerTag);

    // The page's only job is to get params from the URL
    // and pass them as props to the reusable component.
    return (
        <div>
            <StockGraph 
                marketId={marketId}
                playerTag={decodedPlayerTag}
                champion={champion}
            />
        </div>
    );
}