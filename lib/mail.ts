import nodemailer from 'nodemailer'

/**
 * Outbound mail. Verifying that someone owns an address means actually sending to it, so
 * this is the one piece that needs a relay — the school's SMTP server, or a Gmail account
 * with an app password.
 *
 * MAIL_TRANSPORT=console prints the link to the server log instead of sending, for local
 * development. It must be set deliberately: with SMTP simply missing we fail closed, because
 * silently "verifying" without sending would defeat the entire point of this feature.
 */
const MODE = process.env.MAIL_TRANSPORT || 'smtp'

export function mailConfigured(): boolean {
  if (MODE === 'console') return true
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

let cached: nodemailer.Transporter | null = null
function transport() {
  if (cached) return cached
  const port = Number(process.env.SMTP_PORT || 587)
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,          // 465 is implicit TLS; 587 upgrades with STARTTLS
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })
  return cached
}

export function verificationLink(token: string): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  return `${base}/api/auth/verify?token=${token}`
}

export async function sendVerificationEmail(to: string, token: string) {
  const link = verificationLink(token)

  if (MODE === 'console') {
    console.log(`\n[mail:console] verification link for ${to}\n  ${link}\n`)
    return
  }

  await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Confirm your Prop Catalog account',
    text: `Confirm your account by opening this link:\n\n${link}\n\nIt expires in 24 hours. If you did not request an account, ignore this email — nothing was created in your name.`,
    html: `
      <p>Confirm your Prop &amp; Costume Catalog account by clicking below:</p>
      <p><a href="${link}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Confirm my account</a></p>
      <p style="color:#666;font-size:13px">Or paste this into your browser:<br>${link}</p>
      <p style="color:#666;font-size:13px">The link expires in 24 hours. If you did not request an account, you can ignore this email — nothing was created in your name.</p>
    `,
  })
}
