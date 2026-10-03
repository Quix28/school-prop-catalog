'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, errorMessage } from '@/lib/client'
import { useSettings } from '@/app/settings-provider'
import type { Blackout } from '@/lib/settings'

const BLACKOUT_LINE = /^(\d{4}-\d{2}-\d{2})\s*(?:to\s+)?(\d{4}-\d{2}-\d{2})\s*(.*)$/

const blackoutsToText = (list: Blackout[]) =>
  list.map(b => `${b.start} ${b.end}${b.label ? ` ${b.label}` : ''}`).join('\n')

const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500'
const label = 'block text-sm font-medium text-gray-700 mb-1'

export default function SettingsTab() {
  const router = useRouter()
  const current = useSettings()
  const [form, setForm] = useState({ ...current, blackouts: blackoutsToText(current.blackouts) })
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [code, setCode] = useState('')
  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [key]: e.target.value }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const blackouts: Blackout[] = []
    const lines = form.blackouts.split('\n').map(l => l.trim()).filter(Boolean)
    for (const [i, line] of lines.entries()) {
      const m = line.match(BLACKOUT_LINE)
      if (!m) { setMsg({ text: `Blocked dates, line ${i + 1}: use "YYYY-MM-DD YYYY-MM-DD label"`, ok: false }); return }
      blackouts.push({ start: m[1], end: m[2], label: m[3] })
    }
    setSaving(true)
    try {
      await api.put('/api/settings', { ...form, blackouts, code })
      setMsg({ text: 'Settings saved.', ok: true })
      router.refresh()
    } catch (e) {
      setMsg({ text: errorMessage(e), ok: false })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <form onSubmit={save} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Settings</h2>

        <div>
          <label className={label}>Site name</label>
          <input value={form.site_name} onChange={set('site_name')} required maxLength={100} className={input} />
        </div>

        <div>
          <label className={label}>Allowed email domain</label>
          <input value={form.allowed_email_domain} onChange={set('allowed_email_domain')} required className={input} />
          <p className="text-xs text-gray-400 mt-1">Only addresses at this domain can sign up.</p>
        </div>

        <div>
          <label className={label}>Announcement</label>
          <textarea value={form.announcement} onChange={set('announcement')} rows={2} maxLength={500}
            placeholder="Shown at the top of every page. Leave empty for none." className={`${input} resize-none`} />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900 mb-1">Booking rules for students (0 = no limit)</legend>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Max length (days)</label>
              <input type="number" min={0} max={1000} value={form.max_reservation_days} onChange={set('max_reservation_days')} className={input} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Notice (days ahead)</label>
              <input type="number" min={0} max={1000} value={form.min_notice_days} onChange={set('min_notice_days')} className={input} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Max items at once</label>
              <input type="number" min={0} max={1000} value={form.max_items_per_student} onChange={set('max_items_per_student')} className={input} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Blocked dates, one range per line</label>
            <textarea value={form.blackouts} onChange={set('blackouts')} rows={3}
              placeholder="2026-12-01 2026-12-10 Show week" className={`${input} font-mono text-sm`} />
          </div>
        </fieldset>

        {msg && (
          <div className={`p-3 rounded-lg text-sm border ${
            msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {msg.text}
          </div>
        )}

        <div>
          <label className={label}>Confirmation code</label>
          <input type="password" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required
            placeholder="Required to save settings" className={input} />
        </div>

        <button type="submit" disabled={saving}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Backup</h2>
        <p className="text-sm text-gray-500 mb-4">
          The whole database: items, reservations and accounts (with password hashes), so keep it
          private. Photos are not included; back up the uploads folder separately.
        </p>
        <a href="/api/admin/backup" download className="inline-block border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium">
          Download database backup
        </a>
      </div>
    </div>
  )
}
