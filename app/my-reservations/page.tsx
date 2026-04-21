'use client'

import { useState, useEffect } from 'react'
import { supabase, Reservation } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type ReservationWithItem = Reservation & {
  item_name?: string
  item_image?: string
}

const statusConfig: Record<string, { label: string; color: string; icon: string; message: string }> = {
  pending: {
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: '⏳',
    message: 'Your request is waiting for admin approval.'
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: '✅',
    message: 'Your reservation is approved! You can pick it up.'
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: '❌',
    message: 'Your reservation was not approved by the admin.'
  },
  checked_out: {
    label: 'Checked Out',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: '📦',
    message: 'Item is with you. Please return it by the end date.'
  },
  returned: {
    label: 'Returned',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: '🔄',
    message: 'Item has been returned. Thank you!'
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-gray-100 text-gray-500 border-gray-200',
    icon: '🚫',
    message: 'This reservation was cancelled.'
  }
}

export default function MyReservationsPage() {
  const router = useRouter()
  const [reservations, setReservations] = useState<ReservationWithItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => { loadReservations() }, [])

  const loadReservations = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data } = await supabase
      .from('reservations')
      .select('*, items(name, image_url)')
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false })

    setReservations((data || []).map((r: any) => ({
      ...r,
      item_name: r.items?.name || 'Unknown Item',
      item_image: r.items?.image_url || null
    })))
    setLoading(false)
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this reservation?')) return
    await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', id)
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' } : r))
  }

  const filtered = filter === 'all' ? reservations : reservations.filter(r => r.status === filter)

  const isOverdue = (r: ReservationWithItem) =>
    r.status === 'checked_out' && new Date(r.end_date) < new Date()

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center shadow">
        <div>
          <h1 className="text-xl font-bold">📋 My Reservations</h1>
          <p className="text-indigo-200 text-sm">Track your prop & costume requests</p>
        </div>
        <a href="/catalog" className="bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded-lg text-sm">
          ← Back to Catalog
        </a>
      </header>

      {/* Filter tabs */}
      <div className="bg-white border-b px-6 flex gap-1 overflow-x-auto">
        {['all', 'pending', 'approved', 'checked_out', 'returned', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap capitalize transition-colors ${
              filter === s
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {s === 'checked_out' ? 'Checked Out' : s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== 'all' && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                {reservations.filter(r => r.status === s).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-3xl mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-5xl mb-4">📭</p>
            <p className="text-lg font-medium">No reservations yet</p>
            <p className="text-sm mb-6">Browse the catalog to reserve props and costumes</p>
            <a href="/catalog" className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
              Browse Catalog
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(r => {
              const status = statusConfig[r.status] || statusConfig.pending
              const overdue = isOverdue(r)
              return (
                <div key={r.id} className={`bg-white rounded-xl shadow-sm overflow-hidden border ${overdue ? 'border-red-300' : 'border-transparent'}`}>
                  {overdue && (
                    <div className="bg-red-500 text-white text-xs text-center py-1.5 font-medium">
                      ⚠️ OVERDUE — Please return this item immediately!
                    </div>
                  )}
                  <div className="p-5 flex gap-4">
                    {/* Item image */}
                    <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {r.item_image
                        ? <img src={r.item_image} alt={r.item_name} className="w-full h-full object-cover" />
                        : <span className="text-3xl">🎭</span>
                      }
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 truncate">{r.item_name}</h3>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium border shrink-0 ${status.color}`}>
                          {status.icon} {status.label}
                        </span>
                      </div>

                      {/* Status message */}
                      <p className="text-sm text-gray-600 mb-2">{status.message}</p>

                      {/* Dates */}
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        <span>📅 {r.start_date} → {r.end_date}</span>
                        <span>📦 Qty: {r.quantity}</span>
                        <span>🕐 Requested: {new Date(r.requested_at).toLocaleDateString('tr-TR')}</span>
                      </div>

                      {r.purpose && (
                        <p className="text-xs text-gray-500 mt-1">Purpose: {r.purpose}</p>
                      )}

                      {/* Admin notes */}
                      {r.admin_notes && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-xs text-amber-800">
                            <span className="font-medium">Admin note:</span> {r.admin_notes}
                          </p>
                        </div>
                      )}

                      {/* Return reminder */}
                      {r.status === 'checked_out' && !overdue && (
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs text-blue-700">
                            📅 Please return by <span className="font-semibold">{r.end_date}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cancel button */}
                  {r.status === 'pending' && (
                    <div className="px-5 pb-4">
                      <button
                        onClick={() => handleCancel(r.id)}
                        className="text-sm text-red-500 hover:text-red-700 font-medium"
                      >
                        Cancel Request
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}