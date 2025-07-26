import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Navigation from '@/components/Navigation'
import { AuthProvider } from './context/AuthContext'
import { Toaster } from "@/components/ui/toaster" // <-- IMPORT THE TOASTER
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Stock Market Tracker',
  description: 'Track player performance stocks',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <Navigation />
          <main className="max-w-7xl mx-auto p-4">
            {children}
          </main>
          <Toaster /> {/* <-- ADD THE TOASTER COMPONENT HERE, AT THE END */}
        </AuthProvider>
      </body>
    </html>
  )
}
