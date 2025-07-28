'use client'

import { useState } from 'react'
import { useAuth } from '@/app/context/AuthContext'
import { useMarket } from '@/app/context/MarketContext'
import { useRouter } from 'next/navigation'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from '@/hooks/use-toast'

// --- Form Schemas for Validation ---
const createMarketSchema = z.object({
  marketName: z.string().min(3, "Market name must be at least 3 characters").max(50),
})

const joinMarketSchema = z.object({
  inviteCode: z.string().min(6, "Invite code is usually 8 characters").max(10),
})

export default function MarketsPage() {
  const { user } = useAuth()
  const { refreshUserMarkets } = useMarket() // Get the refresh function
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const createForm = useForm<z.infer<typeof createMarketSchema>>({
    resolver: zodResolver(createMarketSchema),
    defaultValues: { marketName: "" },
  })

  const joinForm = useForm<z.infer<typeof joinMarketSchema>>({
    resolver: zodResolver(joinMarketSchema),
    defaultValues: { inviteCode: "" },
  })

  // --- API Call Handlers ---
  const handleCreateMarket = async (values: z.infer<typeof createMarketSchema>) => {
    if (!user) return
    setLoading(true)

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    try {
      const response = await fetch(`${API_URL}/api/markets/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: values.marketName, creator_id: user.id }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Failed to create market');

      toast({
        title: "Market Created!",
        description: `Your new market "${values.marketName}" is ready.`,
      })
      await refreshUserMarkets() // Refresh the global list of markets
      router.push('/') // Redirect to the main dashboard
      
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleJoinMarket = async (values: z.infer<typeof joinMarketSchema>) => {
    if (!user) return
    setLoading(true)
    
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    try {
        const response = await fetch(`${API_URL}/api/markets/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invite_code: values.inviteCode, user_id: user.id }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Failed to join market');
        
        toast({
            title: "Successfully Joined Market!",
            description: "You are now a member.",
        })
        await refreshUserMarkets()
        router.push('/')

    } catch (error: any) {
        toast({ variant: "destructive", title: "Error", description: error.message })
    } finally {
        setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center pt-12">
      <Tabs defaultValue="join" className="w-full max-w-md">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="join">Join Market</TabsTrigger>
          <TabsTrigger value="create">Create Market</TabsTrigger>
        </TabsList>

        {/* Join Market Tab */}
        <TabsContent value="join">
          <Card>
            <CardHeader>
              <CardTitle>Join an Existing Market</CardTitle>
              <CardDescription>Enter an invite code from a friend to join their market.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...joinForm}>
                <form onSubmit={joinForm.handleSubmit(handleJoinMarket)} className="space-y-6">
                  <FormField
                    control={joinForm.control}
                    name="inviteCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invite Code</FormLabel>
                        <FormControl>
                          <Input placeholder="AV7X-5B9P" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Joining...' : 'Join Market'}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Create Market Tab */}
        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create a New Market</CardTitle>
              <CardDescription>Start a new market and invite your friends to play.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(handleCreateMarket)} className="space-y-6">
                  <FormField
                    control={createForm.control}
                    name="marketName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Market Name</FormLabel>
                        <FormControl>
                          <Input placeholder="My Awesome Stock Market" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                     {loading ? 'Creating...' : 'Create Market'}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}