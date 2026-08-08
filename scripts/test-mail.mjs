#!/usr/bin/env node
// Sends one test email so you can check SMTP settings without going through a signup.
//   node scripts/test-mail.mjs you@example.com

import { readFileSync } from 'node:fs'
import nodemailer from 'nodemailer'

// Read .env.local ourselves — this script runs outside Next, which normally loads it.
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* no .env.local — rely on the real environment */ }

const to = process.argv[2]
if (!to) { console.error('Usage: node scripts/test-mail.mjs recipient@example.com'); process.exit(1) }

const { SMTP_HOST, SMTP_PORT = '587', SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error('SMTP_HOST, SMTP_USER and SMTP_PASS must all be set in .env.local')
  process.exit(1)
}

console.log(`host=${SMTP_HOST} port=${SMTP_PORT} user=${SMTP_USER} pass=${'*'.repeat(SMTP_PASS.length)}`)

const port = Number(SMTP_PORT)
const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
})

try {
  await transport.verify()
  console.log('✓ connected and authenticated')
  const info = await transport.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to,
    subject: 'Prop Catalog SMTP test',
    text: 'If you are reading this, confirmation emails will work.',
  })
  console.log('✓ sent:', info.messageId)
  console.log('  envelope from:', info.envelope?.from, '— Gmail rewrites this to your own address')
} catch (e) {
  console.error('✗ failed:', e.message)
  if (/Username and Password not accepted|BadCredentials/i.test(e.message)) {
    console.error('  Gmail rejects normal passwords. Generate an App Password at')
    console.error('  https://myaccount.google.com/apppasswords (needs 2-Step Verification on).')
  }
  process.exit(1)
}
