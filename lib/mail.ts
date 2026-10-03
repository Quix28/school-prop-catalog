import nodemailer from 'nodemailer'

/**
 * Outbound mail over SMTP. MAIL_TRANSPORT=console logs links instead (dev only).
 * Missing SMTP settings disable sign-up rather than skip confirmation.
 */
const MODE = process.env.MAIL_TRANSPORT || 'smtp'

export function mailConfigured(): boolean {
  if (MODE === 'console') {
    // In production nobody would receive their links.
    if (process.env.NODE_ENV === 'production') {
      console.error('MAIL_TRANSPORT=console is not allowed in production; configure SMTP.')
      return false
    }
    return true
  }
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

let cached: nodemailer.Transporter | null = null
function transport() {
  if (cached) return cached
  const port = Number(process.env.SMTP_PORT || 587)
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,          // 465: TLS; 587: STARTTLS
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })
  return cached
}

const appUrl = (path: string) =>
  `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}${path}`

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Links open a page that POSTs; opening a link changes nothing. */
async function send(to: string, subject: string, link: string, action: string, note: string) {
  if (MODE === 'console') {
    console.log(`\n[mail:console] ${subject} to ${to}\n  ${link}\n`)
    return
  }

  await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    // Object, not string: nodemailer parses strings as address lists.
    to: { name: '', address: to },
    subject,
    text: `${action}:\n\n${link}\n\n${note}`,
    html: `
      <p>${esc(action)}:</p>
      <p><a href="${esc(link)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Open the Prop Catalog</a></p>
      <p style="color:#666;font-size:13px">Or paste this into your browser:<br>${esc(link)}</p>
      <p style="color:#666;font-size:13px">${esc(note)}</p>
    `,
  })
}

export const sendVerificationEmail = (to: string, token: string) => send(to,
  'Confirm your Prop Catalog account',
  appUrl(`/verify?token=${token}`),
  'Confirm your Prop Catalog account by opening this link and entering the password you chose',
  'The link expires in 24 hours. If you did not request an account, ignore this email. Nothing was created in your name.')

export const sendPasswordResetEmail = (to: string, token: string) => send(to,
  'Reset your Prop Catalog password',
  appUrl(`/reset-password?token=${token}`),
  'Choose a new password for your Prop Catalog account by opening this link',
  'The link expires in 1 hour and works once. If you did not ask to reset your password, ignore this email. Your password stays the same.')

const STATUS_TEXT: Record<string, string> = {
  approved: 'was approved. You can pick it up',
  rejected: 'was rejected',
  checked_out: 'is now checked out to you. Please return it by the end date',
  returned: 'was marked as returned. Thank you',
  cancelled: 'was cancelled',
}

export function sendReservationEmail(to: string, r: {
  item: string; status: string; start: string; end: string; note: string | null
}) {
  return send(to,
    `Reservation ${r.status.replace('_', ' ')}: ${r.item}`,
    appUrl('/my-reservations'),
    `Your reservation for ${r.item} (${r.start} to ${r.end}) ${STATUS_TEXT[r.status]}. Details are in My Reservations`,
    r.note ? `Note from the admin: ${r.note}` : '')
}
