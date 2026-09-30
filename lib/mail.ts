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

/** Links open a page that POSTs; opening a link changes nothing. */
async function send(to: string, subject: string, link: string, action: string, note: string) {
  if (MODE === 'console') {
    console.log(`\n[mail:console] ${subject} — ${to}\n  ${link}\n`)
    return
  }

  await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    // Object, not string: nodemailer parses strings as address lists.
    to: { name: '', address: to },
    subject,
    text: `${action}:\n\n${link}\n\n${note}`,
    html: `
      <p>${action}:</p>
      <p><a href="${link}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Open the Prop Catalog</a></p>
      <p style="color:#666;font-size:13px">Or paste this into your browser:<br>${link}</p>
      <p style="color:#666;font-size:13px">${note}</p>
    `,
  })
}

export const sendVerificationEmail = (to: string, token: string) => send(to,
  'Confirm your Prop Catalog account',
  appUrl(`/verify?token=${token}`),
  'Confirm your Prop Catalog account by opening this link and entering the password you chose',
  'The link expires in 24 hours. If you did not request an account, ignore this email — nothing was created in your name.')

export const sendPasswordResetEmail = (to: string, token: string) => send(to,
  'Reset your Prop Catalog password',
  appUrl(`/reset-password?token=${token}`),
  'Choose a new password for your Prop Catalog account by opening this link',
  'The link expires in 1 hour and works once. If you did not ask to reset your password, ignore this email — your password stays the same.')
