'use client'

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { useMarket } from '@/app/context/MarketContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Copy, PlusCircle, Trash2, Users, UserX, X } from 'lucide-react';
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

interface MarketManagementPageProps {
    marketId: string;
}

interface MarketMember {
    id: string; // user's UUID
    username: string;
}

// Global singleton variables to prevent re-initialization during navigation
let hasMarketRenderedBefore = false;
let cachedMarketDetails: MarketDetails | null = null;

export default function MarketManagementPage({ marketId }: MarketManagementPageProps) {
    const { user } = useAuth();
    const { refreshUserMarkets } = useMarket();
    const router = useRouter();
    const { toast } = useToast();

    const [marketDetails, setMarketDetails] = useState<MarketDetails | null>(cachedMarketDetails);
    const [loading, setLoading] = useState(false);
    const [initialized, setInitialized] = useState(hasMarketRenderedBefore);
    const [members, setMembers] = useState<MarketMember[]>([]);
    
    // State for the "Add Player" form
    const [newPlayerTag, setNewPlayerTag] = useState('');
    const [initialChampion, setInitialChampion] = useState('');

    // State for the "Add Champion" form (unique for each player)
    const [newChampionInputs, setNewChampionInputs] = useState<{[key: number]: string}>({});

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    const fetchMarketDetails = useCallback(async () => {
        if (!marketId) return;
        
        // Only set loading to true if we don't already have market details and haven't rendered before
        if (!marketDetails && !hasMarketRenderedBefore) {
            setLoading(true);
        }
        
        try {
            // Fetch both sets of data concurrently
            const detailsPromise = fetch(`${API_URL}/api/markets/${marketId}/manage`);
            const membersPromise = fetch(`${API_URL}/api/markets/${marketId}/members`);

            const [detailsResponse, membersResponse] = await Promise.all([detailsPromise, membersPromise]);

            if (!detailsResponse.ok) throw new Error('Failed to fetch market details');
            if (!membersResponse.ok) throw new Error('Failed to fetch market members');

            const detailsData = await detailsResponse.json();
            const membersData = await membersResponse.json();

            setMarketDetails(detailsData);
            setMembers(membersData);
            cachedMarketDetails = detailsData;
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load market data.' });
            if (!hasMarketRenderedBefore) {
                setMarketDetails(null);
            }
        } finally {
            setLoading(false);
            setInitialized(true);
            hasMarketRenderedBefore = true;
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

    const handleRemoveChampion = async (playerId: number, championName: string) => {
        try {
            const response = await fetch(`${API_URL}/api/markets/players/${playerId}/champions/${championName}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                 const result = await response.json();
                 throw new Error(result.detail || 'Failed to remove champion');
            }
            toast({ title: 'Champion Removed', description: `${championName} has been removed from the pool.` });
            fetchMarketDetails(); // Refresh the data to show the change
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
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

    const handleDeleteMarket = async () => {
        if (!user || !marketDetails) return;

        try {
            const response = await fetch(`${API_URL}/api/markets/${marketDetails.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                // Send the user's ID in the body for the security check
                body: JSON.stringify({ user_id: user.id }),
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.detail || "Failed to delete market");
            }

            toast({
                title: "Market Deleted",
                description: `The market "${marketDetails.name}" has been permanently deleted.`,
            });
            
            await refreshUserMarkets();
            router.push('/'); // Redirect to the main dashboard
            
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        }
    };

    const handleLeaveMarket = async () => {
        if (!user || !marketDetails) return;
        try {
            const response = await fetch(`${API_URL}/api/markets/${marketDetails.id}/members/${user.id}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.detail || "Failed to leave market");
            }

            toast({
                title: "You have left the market",
                description: `You are no longer a member of "${marketDetails.name}".`,
            });
            
            // Refresh the global market list and redirect the user
            await refreshUserMarkets();
            router.push('/'); // Or to the selector_lobby page
            
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        }
    };

    const handleKickUser = async (userToKick: MarketMember) => {
        if (!user || !marketDetails) return;

        try {
            const response = await fetch(`${API_URL}/api/markets/${marketDetails.id}/members`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_to_kick_id: userToKick.id,
                    creator_id: user.id
                }),
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.detail || "Failed to kick user");
            }

            toast({
                title: "User Kicked",
                description: `${userToKick.username} has been removed from the market.`,
            });
            
            // After kicking, refresh the data to update the UI
            await fetchMarketDetails();
            
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        }
    };

    const copyInviteCode = () => {
        if (marketDetails?.invite_code) {
            navigator.clipboard.writeText(marketDetails.invite_code);
            toast({ title: 'Copied to clipboard!' });
        }
    };

    if (loading && !initialized && !hasMarketRenderedBefore) {
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
                    
                    {/* Leave Market button - Only visible to non-creators */}
                    {user?.id !== marketDetails.creator_id && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="destructive" className="w-full">Leave Market</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Are you sure you want to leave?</DialogTitle>
                                    <DialogDescription>
                                        Your portfolio and all assets for this market will be lost. This action cannot be undone.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="destructive" onClick={handleLeaveMarket}>Confirm Leave</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
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
                                <CardDescription>Champion Pool ({player.champions.length} / {marketDetails.champions_per_player_limit})</CardDescription>
                                
                                {/* Champion Pool UI */}
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    {player.champions.map(champ => (
                                        <Badge key={champ} variant="secondary" className="pl-3">
                                            {champ}
                                            {isCreator && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-4 w-4 ml-1 rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                                                    onClick={() => handleRemoveChampion(player.id, champ)}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </Badge>
                                    ))}
                                </div>
                                {isCreator && player.champions.length < marketDetails.champions_per_player_limit && (
                                    <form onSubmit={(e) => { e.preventDefault(); handleAddChampion(player.id); }} className="flex gap-2 mt-4">
                                        <Input 
                                            placeholder="Add champion to pool..." 
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

            {/* Members Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Users className="h-5 w-5 mr-2" />
                        Market Members ({members.length} / {marketDetails.player_limit})
                    </CardTitle>
                    <CardDescription>The list of all users currently in this market.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {members.map(member => (
                        <div key={member.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg">
                            <div>
                                <p className="font-semibold">{member.username}</p>
                                {member.id === marketDetails.creator_id && (
                                    <Badge variant="secondary">Creator</Badge>
                                )}
                            </div>
                            {isCreator && member.id !== user.id && (
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600">
                                            <UserX className="h-4 w-4" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Kick {member.username}?</DialogTitle>
                                            <DialogDescription>
                                                Are you sure you want to remove {member.username} from the market? They will have to rejoin with an invite code.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <DialogFooter>
                                            <Button variant="destructive" onClick={() => handleKickUser(member)}>Confirm Kick</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Danger Zone Card - Only visible to creators */}
            {isCreator && (
                <Card className="border-red-500/50">
                    <CardHeader>
                        <CardTitle className="text-red-600">Danger Zone</CardTitle>
                        <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="destructive">Delete This Market</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Are you absolutely sure?</DialogTitle>
                                    <DialogDescription>
                                        This will permanently delete the <strong>{marketDetails.name}</strong> market, 
                                        remove all members, and erase all associated player and stock data.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="destructive" onClick={handleDeleteMarket}>I understand, delete this market</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </CardContent>
                </Card>
            )}
        </div>
    );
} 