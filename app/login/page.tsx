// app/login/page.tsx
'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSignIn = async (formData: FormData) => {
    setLoading(true)
    setError(null)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      // Successful sign-in, redirect to home page
      router.push('/')
    }
    setLoading(false)
  }

  const handleSignUp = async (formData: FormData) => {
    setLoading(true)
    setError(null)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      // Prompt user to check email for confirmation
      setError("Success! Please check your email to confirm your account.")
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white shadow-lg rounded-xl">
        <h2 className="text-2xl font-bold text-center text-gray-900">
          Sign In / Create Account
        </h2>

        {error && (
          <p className="p-3 text-sm text-red-700 bg-red-100 border border-red-200 rounded-md">
            {error}
          </p>
        )}

        {/* --- Sign In Form --- */}
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault()
          handleSignIn(new FormData(e.currentTarget))
        }}>
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
          >
            {loading ? 'Processing...' : 'Sign In'}
          </button>
        </form>
        
        <div className="text-center text-sm text-gray-600">
            <p>Don't have an account? Use the form above to sign up.</p>
            <button
                onClick={(e) => {
                    const form = (e.currentTarget.previousElementSibling as HTMLFormElement);
                    if (form) {
                        e.preventDefault();
                        handleSignUp(new FormData(form));
                    }
                }}
                disabled={loading}
                className="mt-2 text-indigo-600 hover:text-indigo-500 disabled:text-indigo-300"
            >
                {loading ? 'Signing Up...' : 'Sign Up (If account not found)'}
            </button>
        </div>
      </div>
    </div>
  )
}