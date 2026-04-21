'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase, Item, Reservation } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type ReservationWithDetails = Reservation & {
  item_name?: string
  user_email?: string
}

export default function AdminPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'reservations' | 'items' | 'add'>('reservations')
  const [items, setItems] = useState<Item[]>([])
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [uploading, setUploading] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [newItem, setNewItem] = useState({
  name: '',
  description: '',
  category: 'prop' as 'prop' | 'costume',
  subcategory: '',
  quantity_total: 1,
  notes: '',
  image_url: ''
})

  useEffect(() => { checkAdminAndLoad() }, [])

  const checkAdminAndLoad = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/admin-login'); return }

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()

    if (profile?.role !== 'admin') { router.push('/login'); return }

    await loadData()
    setLoading(false)
  }

  const loadData = async () => {
    const [{ data: itemsData }, { data: resData }, { data: profilesData }] = await Promise.all([
      supabase.from('items').select('*').order('name'),
      supabase.from('reservations').select('*, items(name)').order('requested_at', { ascending: false }),
      supabase.from('profiles').select('id, email')
    ])

    const profileMap: Record<string, string> = {}
    profilesData?.forEach(p => { profileMap[p.id] = p.email })

    setItems(itemsData || [])
    setReservations((resData || []).map((r: any) => ({
      ...r,
      item_name: r.items?.name || 'Unknown',
      user_email: profileMap[r.user_id] || r.user_id?.slice(0, 8)
    })))
  }

  const updateReservationStatus = async (id: string, status: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('reservations').update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id
    }).eq('id', id)
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status: status as any } : r))
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `items/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('item-images').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('item-images').getPublicUrl(path)
      setNewItem(prev => ({ ...prev, image_url: data.publicUrl }))
    } catch (e: any) {
      alert('Image upload failed: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleAddItem = async () => {
    if (!newItem.name) return
    setSaveMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    const { quantity_total, name, description, category, subcategory, notes, image_url } = newItem
    const { error } = await supabase.from('items').insert({
    name, description, category, subcategory, notes, image_url,
    quantity_total,
    quantity_available: quantity_total,
    created_by: user?.id
    })
    if (error) { alert(error.message); return }
    setSaveMsg('Item added successfully!')
    setNewItem({ name: '', description: '', category: 'prop', subcategory: '', quantity_total: 1, notes: '', image_url: '' })
    await loadData()
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/admin-login')
  }

  const filteredReservations = reservations.filter(r =>
    statusFilter === 'all' ? true : r.status === statusFilter
  )

  const pendingCount = reservations.filter(r => r.status === 'pending').length

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    checked_out: 'bg-blue-100 text-blue-800',
    returned: 'bg-gray-100 text-gray-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-purple-700 text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div>
          <h1 className="text-xl font-bold">🛠 Admin Panel</h1>
          <p className="text-purple-200 text-xs">Prop & Costume Management</p>
        </div>
        <button onClick={handleSignOut} className="bg-purple-800 hover:bg-purple-900 px-4 py-2 rounded-lg text-sm">
          Sign Out
        </button>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b px-6 flex gap-1">
        {[
          { id: 'reservations', label: `Reservations${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}` },
          { id: 'items', label: `Items (${items.length})` },
          { id: 'add', label: '+ Add Item' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-6xl mx-auto">

        {/* ── RESERVATIONS TAB ── */}
        {activeTab === 'reservations' && (
          <div>
            {/* Status filter */}
            <div className="flex gap-2 mb-5 flex-wrap">
              {['pending', 'approved', 'rejected', 'checked_out', 'returned', 'all'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                    statusFilter === s ? 'bg-purple-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {filteredReservations.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p>No {statusFilter} reservations</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReservations.map(r => (
                  <div key={r.id} className="bg-white rounded-xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{r.item_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[r.status] || 'bg-gray-100 text-gray-600'}`}>
                          {r.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        👤 {r.user_email} · 📅 {r.start_date} → {r.end_date} · Qty: {r.quantity}
                      </p>
                      {r.purpose && <p className="text-sm text-gray-600 mt-1">Purpose: {r.purpose}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        Requested: {new Date(r.requested_at).toLocaleDateString()}
                      </p>
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => updateReservationStatus(r.id, 'approved')}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => updateReservationStatus(r.id, 'rejected')}
                          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    )}
                    {r.status === 'approved' && (
                      <button
                        onClick={() => updateReservationStatus(r.id, 'checked_out')}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shrink-0"
                      >
                        Mark Checked Out
                      </button>
                    )}
                    {r.status === 'checked_out' && (
                      <button
                        onClick={() => updateReservationStatus(r.id, 'returned')}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium shrink-0"
                      >
                        Mark Returned
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ITEMS TAB ── */}
        {activeTab === 'items' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.length === 0 ? (
              <div className="col-span-full text-center py-20 text-gray-400">
                <p className="text-4xl mb-3">📦</p>
                <p>No items yet. Add some from the "Add Item" tab.</p>
              </div>
            ) : items.map(item => (
              <div key={item.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="h-40 bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center overflow-hidden">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    : <span className="text-4xl">{item.category === 'costume' ? '👗' : '🎭'}</span>
                  }
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{item.name}</h3>
                      <p className="text-xs text-gray-500 capitalize mt-0.5">{item.category}{item.subcategory ? ` · ${item.subcategory}` : ''}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.quantity_available > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {item.quantity_available}/{item.quantity_total}
                    </span>
                  </div>
                  {item.description && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{item.description}</p>}
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="mt-3 w-full text-red-500 border border-red-200 hover:bg-red-50 py-1.5 rounded-lg text-sm transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ADD ITEM TAB ── */}
        {activeTab === 'add' && (
          <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">Add New Item</h2>

            {saveMsg && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                ✅ {saveMsg}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Victorian Hat"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select
                    value={newItem.category}
                    onChange={e => setNewItem(p => ({ ...p, category: e.target.value as any }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="prop">Prop</option>
                    <option value="costume">Costume</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
                  <input
                    type="text"
                    value={newItem.subcategory}
                    onChange={e => setNewItem(p => ({ ...p, subcategory: e.target.value }))}
                    placeholder="e.g. Hats, Swords..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Quantity</label>
                <input
                    type="number"
                    min={1}
                    value={newItem.quantity_total}
                    onChange={e => setNewItem(p => ({ ...p, quantity_total: parseInt(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
                />
                </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newItem.description}
                  onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  placeholder="Describe the item..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={newItem.notes}
                  onChange={e => setNewItem(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any special notes..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors"
                >
                  {newItem.image_url ? (
                    <img src={newItem.image_url} alt="Preview" className="h-32 mx-auto object-contain rounded" />
                  ) : (
                    <>
                      <p className="text-3xl mb-2">📷</p>
                      <p className="text-sm text-gray-500">{uploading ? 'Uploading...' : 'Click to upload photo'}</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              <button
                onClick={handleAddItem}
                disabled={!newItem.name || uploading}
                className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add Item to Catalog
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}