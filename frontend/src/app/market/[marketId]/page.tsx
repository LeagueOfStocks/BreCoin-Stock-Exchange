'use client'

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Copy, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// --- Define Types ---
interface PlayerInMarket {
    id: number;
    player_tag: string;
    champions: string[];
}

interface MarketDetails {
    id: number;
    name: string;
    invite_code: string;
    creator_id: string;
    tier: string;
    player_limit: number;
    champions_per_player_limit: number;
    players: PlayerInMarket[];
}

export default function MarketManagementPage() {
    const { user } = useAuth();
    const params = useParams();
    const { toast } = useToast();

    const marketId = params.marketId as string;

    const [marketDetails, setMarketDetails] = useState<MarketDetails | null>(null);
    const [loading, setLoading] = useState(true);
    
    // State for the "Add Player" form
    const [newPlayerTag, setNewPlayerTag] = useState('');
    const [initialChampion, setInitialChampion] = useState('');

    // State for the "Add Champion" form (unique for each player)
    const [newChampionInputs, setNewChampionInputs] = useState<{[key: number]: string}>({});

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    const fetchMarketDetails = useCallback(async () => {
        if (!marketId) return;
        
        // Only set loading to true if we don't already have market details
        if (!marketDetails) {
            setLoading(true);
        }
        
        try {
            const response = await fetch(`${API_URL}/api/markets/${marketId}/manage`);
            if (!response.ok) throw new Error('Failed to fetch market details');
            const data = await response.json();
            setMarketDetails(data);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load market data.' });
        } finally {
            setLoading(false);
        }
    }, [marketId, toast, marketDetails]);

    useEffect(() => {
        fetchMarketDetails();
    }, [fetchMarketDetails]);

    // --- FORM HANDLERS ---
    const handleAddPlayer = async (e: React.FormEvent) => {
        e.preventDefault(); // Prevent default form submission
        if (!user || !newPlayerTag.includes('#') || !initialChampion) {
            toast({ variant: 'destructive', title: 'Invalid Input', description: 'Please provide a valid Player Tag and Initial Champion.' });
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/markets/${marketId}/players`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    player_tag: newPlayerTag, 
                    user_id: user.id, // Needed for backend validation
                    initial_champion: initialChampion, // The new required field
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Failed to add player');
            
            toast({ title: 'Player Added!', description: `${newPlayerTag} has been listed with ${initialChampion}.` });
            setNewPlayerTag('');
            setInitialChampion('');
            fetchMarketDetails(); // Refresh data
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        }
    };

    const handleAddChampion = async (playerId: number) => {
        const championName = newChampionInputs[playerId];
        if (!championName) return;

         try {
            const response = await fetch(`${API_URL}/api/markets/players/${playerId}/champions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ champion_name: championName }),
            });
             if (!response.ok) throw new Error('Failed to add champion');

             toast({ title: 'Champion Added!' });
             setNewChampionInputs(prev => ({...prev, [playerId]: ''})); // Clear input for this specific player
             fetchMarketDetails(); // Refresh data
         } catch (error: any) {
             toast({ variant: 'destructive', title: 'Error adding champion', description: error.message });
         }
    };
    
    const handleRemovePlayer = async (playerId: number, playerTag: string) => {
        try {
            const response = await fetch(`${API_URL}/api/markets/players/${playerId}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to remove player');
            
            toast({ title: 'Player Removed', description: `${playerTag} has been removed from the market.` });
            fetchMarketDetails(); // Refresh data
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error removing player', description: error.message });
        }
    }

    const copyInviteCode = () => {
        if (marketDetails?.invite_code) {
            navigator.clipboard.writeText(marketDetails.invite_code);
            toast({ title: 'Copied to clipboard!' });
        }
    };

    if (loading) {
        return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
    }

    if (!marketDetails) {
        return <p>Market not found.</p>;
    }
    
    const isCreator = user?.id === marketDetails.creator_id;

    return (
        <div className="space-y-6">
            {/* Market Info Card */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="text-2xl">{marketDetails.name}</CardTitle>
                            <CardDescription>Manage your market settings and players.</CardDescription>
                        </div>
                        <Badge variant={marketDetails.tier === 'free' ? 'secondary' : 'default'}>{marketDetails.tier.toUpperCase()}</Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Input value={marketDetails.invite_code} readOnly />
                        <Button variant="outline" size="icon" onClick={copyInviteCode}><Copy className="h-4 w-4" /></Button>
                    </div>
                </CardContent>
            </Card>

            {/* Players Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Market Players ({marketDetails.players.length} / {marketDetails.player_limit})</CardTitle>
                    <CardDescription>Add or remove players and their champion pools.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Add Player Form */}
                    {isCreator && (
                        <form onSubmit={handleAddPlayer} className="p-4 border rounded-lg bg-muted/50 space-y-4">
                           <h3 className="font-semibold">Add New Player</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <Input placeholder="PlayerName#TAG" value={newPlayerTag} onChange={(e) => setNewPlayerTag(e.target.value)} />
                               <Input placeholder="Initial Champion (e.g., Yasuo)" value={initialChampion} onChange={(e) => setInitialChampion(e.target.value)} />
                            </div>
                           <Button type="submit" className="w-full md:w-auto">Add Player to Market</Button>
                        </form>
                    )}
                    
                    {/* List of Players */}
                    <div className="space-y-4">
                        {marketDetails.players.map(player => (
                            <div key={player.id} className="p-4 border rounded-lg">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-lg">{player.player_tag}</p>
                                    {isCreator && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader><DialogTitle>Are you sure?</DialogTitle></DialogHeader>
                                                <DialogDescription>
                                                    This will permanently remove {player.player_tag} from the market. This action cannot be undone.
                                                </DialogDescription>
                                                <DialogFooter>
                                                    <Button variant="destructive" onClick={() => handleRemovePlayer(player.id, player.player_tag)}>Confirm Delete</Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {player.champions.map(champ => <Badge key={champ} variant="outline">{champ}</Badge>)}
                                </div>
                                {isCreator && player.champions.length < marketDetails.champions_per_player_limit && (
                                    <form onSubmit={(e) => { e.preventDefault(); handleAddChampion(player.id); }} className="flex gap-2 mt-4">
                                        <Input 
                                            placeholder="Add another champion..." 
                                            value={newChampionInputs[player.id] || ''} 
                                            onChange={(e) => setNewChampionInputs(prev => ({...prev, [player.id]: e.target.value}))} 
                                        />
                                        <Button type="submit" size="sm">Add</Button>
                                    </form>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}