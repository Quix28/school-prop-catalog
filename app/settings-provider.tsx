'use client'

import { createContext, useContext } from 'react'
import type { Settings } from '@/lib/settings'

const SettingsContext = createContext<Settings | null>(null)

/** Filled by the root layout, so pages get settings without a fetch. */
export function SettingsProvider({ value, children }: { value: Settings; children: React.ReactNode }) {
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export const useSettings = () => useContext(SettingsContext)!
