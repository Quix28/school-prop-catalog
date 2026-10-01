'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, ApiError, errorMessage } from '@/lib/client'
import { useSettings } from '@/app/settings-provider'

/** Confirms with the sign-up password; loading the page alone changes nothing. */
function VerifyResult() {
  const router = useRouter()
  const { allowed_email_domain } = useSettings()
  const token = useSearchParams().get('token') || ''
  const [state, setState] = useState<'confirm' | 'ok' | 'invalid'>(token ? 'confirm' : 'invalid')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)

  const confirmAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setConfirming(true)
    setError('')
    try {
      await api.post('/api/auth/verify', { token, password })
      setState('ok')
    } catch (e) {
      if (e instanceof ApiError && e.data?.invalid) setState('invalid')
      else setError(errorMessage(e))
    } finally {
      setConfirming(false)
    }
  }

  const resend = async () => {
    setSending(true)
    setMsg('')
    try {
      const r = await api.post<{ message: string }>('/api/auth/resend', { email })
      setMsg(r.message)
    } catch (e) {
      setMsg(errorMessage(e))
    } finally {
      setSending(false)
    }
  }

  if (state === 'ok') {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
        <p className="text-5xl mb-4">✅</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Email confirmed</h1>
        <p className="text-gray-500 text-sm mb-6">You&apos;re signed in and ready to reserve items.</p>
        <button
          onClick={() => router.push('/catalog')}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium"
        >
          Go to the catalog
        </button>
      </div>
    )
  }

  if (state === 'confirm') {
    return (
      <form onSubmit={confirmAccount} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <p className="text-5xl mb-4 text-center">✉️</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">Confirm your account</h1>
        <p className="text-gray-500 text-sm mb-6 text-center">
          Enter the password you chose when you signed up.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error} <a href="/signup" className="underline">Sign up again</a>
          </div>
        )}

        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoFocus
          placeholder="••••••••"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={!password || confirming}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
        >
          {confirming ? 'Confirming…' : 'Confirm my account'}
        </button>
      </form>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <p className="text-5xl mb-4 text-center">⏳</p>
      <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">Link not valid</h1>
      <p className="text-gray-500 text-sm mb-6 text-center">
        Confirmation links expire after 24 hours, can only be used once, and stop working when a
        newer one is sent. Enter your address and we&apos;ll send a fresh one. Already confirmed?{' '}
        <a href="/login" className="text-indigo-600 hover:underline">Sign in</a>.
      </p>

      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder={`you@${allowed_email_domain}`}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:ring-2 focus:ring-indigo-500"
      />
      <button
        onClick={resend}
        disabled={!email || sending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
      >
        {sending ? 'Sending…' : 'Send a new link'}
      </button>

      {msg && <p className="text-sm text-gray-600 mt-4 text-center">{msg}</p>}

      <p className="text-center mt-6">
        <a href="/login" className="text-indigo-600 text-sm hover:underline">Back to sign in</a>
      </p>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Suspense fallback={<div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />}>
        <VerifyResult />
      </Suspense>
    </div>
  )
}
