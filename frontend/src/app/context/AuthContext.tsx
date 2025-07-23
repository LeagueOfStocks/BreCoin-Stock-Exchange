'use client'

import { createContext, useState, useEffect, useContext } from 'react'
import { supabase } from '@/utils/supabase'
import { useRouter } from 'next/navigation'
// Import Supabase-specific types
import type { User, AuthError, SignInWithPasswordCredentials, AuthResponse } from '@supabase/supabase-js'

// Define the shape of our context
interface AuthContextType {
  user: User | null;
  signIn: (credentials: SignInWithPasswordCredentials) => Promise<AuthResponse>;
  signOut: () => Promise<{ error: AuthError | null }>;
  // Add other functions like signUp if you need them later
}

// Create the context with an initial value of null
const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }
    
    getSession()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
        if (event === 'SIGNED_OUT') {
            router.push('/login')
        }
      }
    )

    return () => {
      authListener?.unsubscribe()
    }
  }, [router])

  // Define the context value that matches the interface
  const value: AuthContextType = {
    signIn: (data) => supabase.auth.signInWithPassword(data),
    signOut: () => supabase.auth.signOut(),
    user,
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

// This custom hook provides a safer way to access the context
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}