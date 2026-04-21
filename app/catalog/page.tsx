'use client'

import { useState, useEffect } from 'react'
import { supabase, Item } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function CatalogPage() {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'prop' | 'costume'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [reserving, setReserving] = useState(false)
  const [reservationForm, setReservationForm] = useState({
    start_date: '',
    end_date: '',
    quantity: 1,
    purpose: ''
  })
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  const checkAuthAndLoad = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUser(user)
    const { data } = await supabase.from('items').select('*').order('name')
    setItems(data || [])
    setLoading(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleReserve = async () => {
    if (!selectedItem || !user) return
    setReserving(true)
    setErrorMsg('')
    try {
      const { error } = await supabase.from('reservations').insert({
        item_id: selectedItem.id,
        user_id: user.id,
        quantity: reservationForm.quantity,
        start_date: reservationForm.start_date,
        end_date: reservationForm.end_date,
        purpose: reservationForm.purpose,
        status: 'pending'
      })
      if (error) throw error
      setSuccessMsg('Reservation submitted! Awaiting admin approval.')
      setSelectedItem(null)
      setReservationForm({ start_date: '', end_date: '', quantity: 1, purpose: '' })
    } catch (e: any) {
      setErrorMsg(e.message)
    } finally {
      setReserving(false)
    }
  }

  const filtered = items.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.subcategory?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

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
        <h1 className="text-xl font-bold">🎭 Prop & Costume Catalog</h1>
        <p className="text-indigo-200 text-sm">{user?.email}</p>
      </div>
      <div className="flex gap-2">
        <a href="/my-reservations" className="bg-indigo-500 hover:bg-indigo-400 px-4 py-2 rounded-lg text-sm">
          My Reservations
        </a>
        <button onClick={handleSignOut} className="bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded-lg text-sm">
          Sign Out
        </button>
      </div>
    </header>

      {/* Success/Error banner */}
      {successMsg && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3 text-green-700 text-sm flex justify-between">
          ✅ {successMsg}
          <button onClick={() => setSuccessMsg('')}>✕</button>
        </div>
      )}

      {/* Search & Filter */}
      <div className="bg-white border-b px-6 py-4 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search items..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <div className="flex gap-2">
          {(['all', 'prop', 'costume'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-lg font-medium text-sm capitalize transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-20 text-gray-500">
            <p className="text-5xl mb-4">🎭</p>
            <p className="text-lg font-medium">No items found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        ) : filtered.map(item => (
          <div key={item.id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
            {/* Image */}
            <div className="h-48 bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center overflow-hidden">
              {item.image_url
                ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                : <span className="text-5xl">{item.category === 'costume' ? '👗' : '🎭'}</span>
              }
            </div>

            {/* Info */}
            <div className="p-4 flex flex-col flex-1">
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-semibold text-gray-900 leading-tight">{item.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 shrink-0 ${
                  item.category === 'costume' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {item.category}
                </span>
              </div>

              {item.subcategory && (
                <p className="text-xs text-gray-500 mb-2">{item.subcategory}</p>
              )}

              {item.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2 flex-1">{item.description}</p>
              )}

              {/* Availability */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-medium ${
                  item.quantity_available > 0 ? 'text-green-600' : 'text-red-500'
                }`}>
                  {item.quantity_available > 0
                    ? `✓ ${item.quantity_available} available`
                    : '✗ Not available'}
                </span>
                {item.condition && (
                  <span className="text-xs text-gray-400 capitalize">{item.condition}</span>
                )}
              </div>

              <button
                onClick={() => {
                  setSelectedItem(item)
                  setErrorMsg('')
                }}
                disabled={item.quantity_available === 0}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                  item.quantity_available > 0
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {item.quantity_available > 0 ? 'Reserve' : 'Unavailable'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Reservation Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Reserve Item</h2>
            <p className="text-gray-500 text-sm mb-5">{selectedItem.name}</p>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={reservationForm.start_date}
                    onChange={e => setReservationForm(f => ({ ...f, start_date: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={reservationForm.end_date}
                    onChange={e => setReservationForm(f => ({ ...f, end_date: e.target.value }))}
                    min={reservationForm.start_date || new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity (max: {selectedItem.quantity_available})
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedItem.quantity_available}
                  value={reservationForm.quantity}
                  onChange={e => setReservationForm(f => ({ ...f, quantity: parseInt(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purpose / Notes</label>
                <textarea
                  value={reservationForm.purpose}
                  onChange={e => setReservationForm(f => ({ ...f, purpose: e.target.value }))}
                  placeholder="e.g. School play, Drama class..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setSelectedItem(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReserve}
                disabled={reserving || !reservationForm.start_date || !reservationForm.end_date}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reserving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}