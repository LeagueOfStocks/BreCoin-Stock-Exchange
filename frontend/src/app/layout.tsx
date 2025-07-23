import { Inter } from 'next/font/google'
import Navigation from '@/components/Navigation'
import './globals.css'
import { AuthProvider } from './context/AuthContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Stock Market Tracker',
  description: 'Track player performance stocks',
}

// Add the type for the props object
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
        </AuthProvider>
      </body>
    </html>
  )
}
