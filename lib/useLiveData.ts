'use client'

import { useEffect, useRef } from 'react'

/**
 * Loads on mount and again when the tab regains focus, so inventory never goes stale.
 * The loader lives in a ref so a new closure each render doesn't re-register listeners.
 */
export function useLiveData(load: () => void | Promise<void>) {
  const latest = useRef(load)

  useEffect(() => { latest.current = load })

  useEffect(() => {
    const run = () => { void latest.current() }
    run()

    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
