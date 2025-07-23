import { createBrowserClient } from '@supabase/ssr'

// Define a function to create the client
const createClient = () =>
  createBrowserClient(
    // Pass in your environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

// Export the client instance
export const supabase = createClient()
