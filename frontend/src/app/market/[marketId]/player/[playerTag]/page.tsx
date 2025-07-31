import StockGraph from "@/components/features/stocks/StockGraph"; // <-- Import the component

interface PageProps {
    params: Promise<{
        marketId: string;
        playerTag: string;
    }>
}

export default async function StockDetailPage({ params }: PageProps) {
    const { marketId, playerTag } = await params;
    const decodedPlayerTag = decodeURIComponent(playerTag);

    // The page's only job is to get params from the URL
    // and pass them as props to the reusable component.
    return (
        <div>
            <StockGraph 
                playerTag={decodedPlayerTag}
            />
        </div>
    );
}