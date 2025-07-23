'use client'

import { useState } from 'react'
import { supabase } from '@/utils/supabase'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FaGoogle, FaDiscord, FaTwitch } from 'react-icons/fa'
import type { Provider } from '@supabase/supabase-js' // Import the Provider type

export default function LoginPage() {
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const router = useRouter()

  // Type the form event
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Use the official Provider type for social logins
  const handleSocialLogin = async (provider: Provider) => {
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider })
      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Sign in to continue to the market.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 mb-4">
            <Button variant="outline" className="w-full flex items-center gap-2" onClick={() => handleSocialLogin('google')} disabled={loading}>
              <FaGoogle /> Sign in with Google
            </Button>
            <Button variant="outline" className="w-full flex items-center gap-2" onClick={() => handleSocialLogin('discord')} disabled={loading}>
              <FaDiscord /> Sign in with Discord
            </Button>
            <Button variant="outline" className="w-full flex items-center gap-2" onClick={() => handleSocialLogin('twitch')} disabled={loading}>
              <FaTwitch /> Sign in with Twitch
            </Button>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or continue with email</span></div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Logging in...' : 'Login with Email'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}