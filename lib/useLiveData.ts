'use client'

import { useEffect, useRef } from 'react'

/**
 * Loads on mount, and reloads whenever the tab regains focus or becomes visible.
 *
 * The pages show live inventory, so anything cached goes stale the moment someone else acts —
 * an admin approving a request, or the same user working in a second tab. Refetching on focus
 * costs one small query and removes the need to reload by hand.
 *
 * The loader is held in a ref so passing a fresh closure each render (which every one of these
 * pages does) does not re-register the listeners or re-fire the effect.
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
