'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api, ApiError, errorMessage } from '@/lib/client'

/**
 * Without a token: ask for the address and email a link. With one (the emailed link): choose
 * the new password. Opening the link changes nothing, so mail scanners cannot spend it.
 */
function ResetPassword() {
  const token = useSearchParams().get('token') || ''
  const [state, setState] = useState<'form' | 'done' | 'invalid'>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const requestLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api.post<{ message: string }>('/api/auth/forgot', { email })
      setMsg(r.message)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const setNewPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setBusy(true)
    setError('')
    try {
      await api.post('/api/auth/reset', { token, password })
      setState('done')
    } catch (e) {
      if (e instanceof ApiError && e.data?.invalid) setState('invalid')
      else setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const card = 'bg-white rounded-2xl shadow-xl p-8 w-full max-w-md'
  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:ring-2 focus:ring-indigo-500'
  const button = 'w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium'
  const errorBox = error && (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
  )

  if (state === 'done') {
    return (
      <div className={`${card} text-center`}>
        <p className="text-5xl mb-4">✅</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Password changed</h1>
        <p className="text-gray-500 text-sm mb-6">
          You&apos;ve been signed out everywhere. Sign in with your new password.
        </p>
        <a href="/login" className={`${button} block`}>Sign in</a>
        <a href="/admin-login" className="block mt-4 text-sm text-gray-600 hover:text-gray-900">
          Admin Login →
        </a>
      </div>
    )
  }

  if (token && state === 'form') {
    return (
      <form onSubmit={setNewPassword} className={card}>
        <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">Choose a new password</h1>
        <p className="text-gray-500 text-sm mb-6 text-center">At least 6 characters.</p>
        {errorBox}
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          required minLength={6} autoFocus autoComplete="new-password" placeholder="New password"
          className={input} />
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
          required autoComplete="new-password" placeholder="Confirm new password" className={input} />
        <button type="submit" disabled={busy} className={button}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={requestLink} className={card}>
      <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">
        {state === 'invalid' ? 'Link not valid' : 'Forgot your password?'}
      </h1>
      <p className="text-gray-500 text-sm mb-6 text-center">
        {state === 'invalid'
          ? 'Reset links expire after an hour and work once. Request a new one below.'
          : 'Enter your address and we’ll email you a link to choose a new password.'}
      </p>
      {errorBox}
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
        placeholder="you@robcol.k12.tr" className={input} />
      <button type="submit" disabled={busy || !email} className={button}>
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      {msg && <p className="text-sm text-gray-600 mt-4 text-center">{msg}</p>}
      <p className="text-center mt-6">
        <a href="/login" className="text-indigo-600 text-sm hover:underline">Back to sign in</a>
      </p>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Suspense fallback={<div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />}>
        <ResetPassword />
      </Suspense>
    </div>
  )
}
