'use client'

import { useEffect, useState } from 'react'

/** Cropped thumbnail that fills its box; tapping it shows the whole photo full screen. */
export default function ZoomablePhoto({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full h-full cursor-zoom-in" aria-label={`View full photo of ${alt}`}>
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center p-4 z-50 cursor-zoom-out"
        >
          <img src={src} alt={alt} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
          <p className="text-white mt-3 text-sm">{alt} · tap anywhere to close</p>
        </div>
      )}
    </>
  )
}
