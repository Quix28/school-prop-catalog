# School Prop & Costume Catalog

Next.js app for reserving school theatre props and costumes. **Runs entirely on your own
hardware** — a Raspberry Pi 4 is plenty. No cloud account, no external service, no API keys.

- **Database:** SQLite (`better-sqlite3`), one file you can copy to back up
- **Auth:** own sessions, passwords hashed with Node's built-in `scrypt`, httpOnly cookies
- **Image storage:** files on disk, served through the app

## Local development

```sh
npm install
cp .env.example .env.local     # defaults are fine for local work
npm run create-admin           # prompts for the first admin's email + password
npm run dev                    # http://localhost:3000
```

Students register themselves at `/signup`; admins sign in at `/admin-login`.

### Email confirmation

Sign-up sends a confirmation link and the account stays inert until it is opened, so knowing
someone's address is not enough to open an account in their name. For local work set
`MAIL_TRANSPORT=console` and the link is printed to the server log instead of being sent.

**In production you must configure SMTP** (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
and set `APP_URL` to the address students will actually reach — the confirmation link is built
from it. With SMTP missing, sign-up is refused rather than creating accounts nobody can confirm.
Check the settings before relying on them:

```sh
node scripts/test-mail.mjs you@example.com
```

**Using a school Office 365 / Outlook account:** likely to fail with
`535 5.7.139 ... SmtpClientAuthentication is disabled for the Tenant`. Microsoft has disabled
SMTP AUTH by default on every tenant since 2020, and no password will work until an
administrator enables it for the mailbox:

```powershell
Set-CASMailbox -Identity you@school.tr -SmtpClientAuthenticationDisabled $false
```

That is a request for whoever runs the school's Microsoft tenant. Until then, use another relay.

**Using Gmail:** you need an *App Password*, not the account password — Google disabled plain
password SMTP in 2022. Turn on 2-Step Verification, then create one at
<https://myaccount.google.com/apppasswords> and use it as `SMTP_PASS`.

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=abcdefghijklmnop
```

Paste the 16-character app password **without its spaces**, and never put a `# comment` on the
same line: systemd's `EnvironmentFile` keeps both as part of the value, so a password that
works under `npm run dev` fails on the Pi.

Two things to expect with Gmail: it **rewrites the From address** to your own account no matter
what `SMTP_FROM` says (unless you set up a verified "Send mail as" alias), and free accounts are
capped around **500 messages a day**. The school's own relay is better if you can get
credentials — mail from a personal Gmail asking students to click a link looks like phishing and
is more likely to be filtered.

Links expire after 24 hours and are single-use. The link opens a page that asks for the password
chosen at sign-up, and only that activates the account — opening the link alone does nothing, so
mail scanners (Microsoft Safe Links) that open every link cannot use it up. If a student
registers an address they don't own, the real owner can still claim it: an unconfirmed
registration is overwritten rather than blocking the address, and because confirming needs the
password, the owner's click can never activate the stranger's password.

**Forgot password** (`/reset-password`, linked from both sign-in pages) uses the same mail
settings. The link expires after an hour, works once, and signs the account out everywhere.
Only confirmed accounts get one; an unconfirmed sign-up is fixed by signing up again.

## Deploying to a Raspberry Pi 4

### 1. Build somewhere other than the Pi

`next build` with the React Compiler needs well over 4 GB and **will likely be killed by the
OOM reaper on a 4 GB Pi.** Build on your laptop and copy the result:

```sh
npm ci && npm run build        # also copies .next/static and public/ into the standalone folder
rsync -a --exclude data/ --exclude '.env*' --exclude node_modules/better-sqlite3/ \
  .next/standalone/ pi@raspberrypi:/srv/prop-catalog/
rsync -a scripts deploy .env.example pi@raspberrypi:/srv/prop-catalog/
```

The `standalone` output bundles its own minimal `node_modules`, so the Pi never runs `npm ci`.

The excludes are what make a redeploy safe: without them rsync would overwrite the Pi's live
database, its `.env.local` and the Linux build of `better-sqlite3` (step 2) with your laptop's
copies. The build is also configured never to put those into `.next/standalone` in the first
place — check with `ls -a .next/standalone`, which should show no `data` and no `.env.local`.

If you would rather build on the Pi anyway, add swap first and expect ~15 minutes:

```sh
sudo dphys-swapfile swapoff
sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
```

### 2. Replace the native module on the Pi

`better-sqlite3` is a compiled binding. The copy that comes across in `standalone/` is a
**macOS (Mach-O) binary** and will not load on Linux — the server exits on first request with
an "invalid ELF header" style error.

`npm rebuild` does **not** work here: the standalone output ships only `build/`, `lib/` and
`package.json`, with `binding.gyp`, `src/` and `deps/` stripped, so there is nothing to compile.
Install it fresh instead, which fetches the full package and builds it for linux-arm64:

```sh
sudo apt install -y build-essential python3
cd /srv/prop-catalog
npm install better-sqlite3@12.11.1        # match the version in package.json
```

Expect a few minutes — it compiles the SQLite amalgamation. Node's major version on the Pi
must match the one you built with (`node -v` on both), or the ABI won't line up.

Verify before starting the service:

```sh
node -e "require('better-sqlite3'); console.log('native module OK')"
```

### 3. Put the data on an SSD, not the SD card

SQLite writes constantly; SD cards die from it. Mount a USB SSD and point `DATA_DIR` there:

```sh
sudo mkdir -p /srv/prop-catalog/data      # or /mnt/ssd/prop-catalog
sudo chown pi:pi /srv/prop-catalog/data
```

### 4. Configure and start

```sh
cd /srv/prop-catalog
cp .env.example .env.local
nano .env.local                # see the list below
node scripts/test-mail.mjs you@example.com
node --env-file=.env.local scripts/create-admin.mjs
sudo cp deploy/prop-catalog.service /etc/systemd/system/   # check User= first
sudo systemctl daemon-reload && sudo systemctl enable --now prop-catalog
```

In `.env.local`, set:

- `DATA_DIR`: the SSD path from step 3. If it is not `/srv/prop-catalog/data`, add it to
  `ReadWritePaths` in the service file.
- `ALLOWED_EMAIL_DOMAIN`: your school's domain.
- `APP_URL`: the public `https://` address. Confirmation links are built from it.
- `MAIL_TRANSPORT`: delete the line. `console` is refused in production.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: see *Email confirmation*.
- `ADMIN_PROMOTE_CODE`: a long random string (`openssl rand -hex 16`). Role changes stay
  disabled without it.
- `COOKIE_SECURE`, `TRUST_PROXY`: both `true` once step 5 is done.

`create-admin.mjs` needs `--env-file`: without it `DATA_DIR` is ignored and the admin is written
to a different database from the one the server uses.

### 5. Serve it over HTTPS

**Do not expose the Next server directly on port 80.** Put Caddy in front — it obtains and
renews a certificate on its own:

```
catalog.yourschool.tr {
    reverse_proxy localhost:3000
}
```

Then set `COOKIE_SECURE=true` and `TRUST_PROXY=true` in `.env.local` and restart. Leave
`COOKIE_SECURE` `false` while you are on plain HTTP, or login will appear to succeed and then
immediately log you out — a `Secure` cookie is silently discarded over `http://`. Without
`TRUST_PROXY`, every visitor looks like the same client to the rate limiter, so one busy
classroom can lock everyone else out of logging in.

> Exposing a Pi on a school network to the public internet is a real risk you are taking on.
> Sessions are httpOnly cookies, login and signup are rate limited, uploads are type- and
> size-checked, and every admin action is authorised server-side — but keep the OS patched
> and consider restricting access with Tailscale or a VPN instead of opening it to everyone.

## Backups

Everything that matters is in `DATA_DIR`:

```sh
sqlite3 $DATA_DIR/catalog.db ".backup '/mnt/backup/catalog-$(date +%F).db'"
tar czf /mnt/backup/uploads-$(date +%F).tar.gz -C $DATA_DIR uploads
```

Use `.backup` rather than copying the file — a plain `cp` of a live WAL database can capture a
torn state.

## Layout

| Path | Purpose |
|---|---|
| `lib/db.ts` | SQLite connection, schema, WAL/foreign-key pragmas |
| `lib/auth.ts` | scrypt hashing, sessions, `requireUser` / `requireAdmin` guards |
| `lib/ratelimit.ts` | in-memory login/signup throttle |
| `lib/client.ts` | browser-side `fetch` wrapper used by the pages |
| `app/api/**` | all database access — nothing touches SQLite from the browser |
| `scripts/create-admin.mjs` | bootstrap or promote an admin |
| `deploy/` | systemd unit |

Authorisation lives in the API routes. The role checks in the pages only decide where to
redirect; every admin route re-checks the session's role independently, so a student cannot
reach admin functions by calling the API directly.

## Availability

Nothing stores a running count. A reservation holds its units for its own dates, from the moment
it is requested until it is rejected, cancelled or returned; an overdue checkout keeps holding
until it is marked returned. A request is refused if the units held on the dates it asks for
leave too few free. The catalog's "available today" badge uses the same rule for today only.
