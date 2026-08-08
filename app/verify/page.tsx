'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/client'

function VerifyResult() {
  const router = useRouter()
  const status = useSearchParams().get('status')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)

  const resend = async () => {
    setSending(true)
    setMsg('')
    try {
      const r = await api.post<{ message: string }>('/api/auth/resend', { email })
      setMsg(r.message)
    } catch (e: any) {
      setMsg(e.message)
    } finally {
      setSending(false)
    }
  }

  if (status === 'ok') {
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

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <p className="text-5xl mb-4 text-center">⏳</p>
      <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">Link not valid</h1>
      <p className="text-gray-500 text-sm mb-6 text-center">
        Confirmation links expire after 24 hours and can only be used once. Enter your address
        and we&apos;ll send a fresh one.
      </p>

      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@robcol.k12.tr"
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
