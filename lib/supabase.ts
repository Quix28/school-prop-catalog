import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// TypeScript types for database
export type Profile = {
  id: string
  email: string
  full_name: string | null
  role: 'student' | 'admin'
  created_at: string
  updated_at: string
}

export type Item = {
  id: string
  name: string
  description: string | null
  category: 'prop' | 'costume'
  subcategory: string | null
  quantity_total: number
  quantity_available: number
  image_url: string | null
  additional_images: string[] | null
  condition: 'excellent' | 'good' | 'fair' | 'poor' | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export type Reservation = {
  id: string
  item_id: string
  user_id: string
  quantity: number
  start_date: string
  end_date: string
  status: 'pending' | 'approved' | 'rejected' | 'checked_out' | 'returned' | 'cancelled'
  purpose: string | null
  admin_notes: string | null
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  checked_out_at: string | null
  returned_at: string | null
}
