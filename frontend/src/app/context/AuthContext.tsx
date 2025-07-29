'use client'

import { createContext, useState, useEffect, useContext } from 'react'
import { supabase } from '@/utils/supabase'
import { useRouter } from 'next/navigation'
// Import all the necessary types from Supabase
import type { User, AuthError, SignInWithPasswordCredentials, SignUpWithPasswordCredentials, AuthResponse } from '@supabase/supabase-js'

// Define the shape of our context, including signUp
interface AuthContextType {
  user: User | null;
  signUp: (credentials: SignUpWithPasswordCredentials) => Promise<AuthResponse>;
  signIn: (credentials: SignInWithPasswordCredentials) => Promise<AuthResponse>;
  signOut: () => Promise<{ error: AuthError | null }>;
  isLoading: boolean; // Export loading state for components that need it
}

// Create the context with an initial value of null
const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setUser(session?.user ?? null)
      } catch (error) {
        console.error('Error getting session:', error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    
    getSession()

    // Correctly destructure the subscription object
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
        if (event === 'SIGNED_OUT') {
            router.push('/login')
        }
      }
    )

    // Use the unsubscribe method on the subscription object
    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  // Define the context value that matches the interface
  // It now includes the signUp function
  const value: AuthContextType = {
    signUp: (data) => supabase.auth.signUp(data),
    signIn: (data) => supabase.auth.signInWithPassword(data),
    signOut: () => supabase.auth.signOut(),
    user,
    isLoading: loading, // Expose loading state
  }

  // Always render children, let individual components handle loading states
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// This custom hook provides a safer way to access the context
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined || context === null) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
