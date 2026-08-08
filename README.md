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

## Deploying to a Raspberry Pi 4

### 1. Build somewhere other than the Pi

`next build` with the React Compiler needs well over 4 GB and **will likely be killed by the
OOM reaper on a 4 GB Pi.** Build on your laptop and copy the result:

```sh
npm ci && npm run build
rsync -a .next/standalone/ .next/static pi@raspberrypi:/srv/prop-catalog/
rsync -a public/ pi@raspberrypi:/srv/prop-catalog/public/
```

The `standalone` output bundles its own minimal `node_modules`, so the Pi never runs `npm ci`.

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
cp .env.example .env.local     # set DATA_DIR, ALLOWED_EMAIL_DOMAIN, COOKIE_SECURE
node scripts/create-admin.mjs
sudo cp deploy/prop-catalog.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now prop-catalog
```

### 5. Serve it over HTTPS

**Do not expose the Next server directly on port 80.** Put Caddy in front — it obtains and
renews a certificate on its own:

```
catalog.yourschool.tr {
    reverse_proxy localhost:3000
}
```

Then set `COOKIE_SECURE=true` in `.env.local` and restart. Leave it `false` while you are on
plain HTTP, or login will appear to succeed and then immediately log you out — a `Secure`
cookie is silently discarded over `http://`.

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

## Known gap

`quantity_available` is set equal to `quantity_total` when an item is created and is never
decremented as reservations are approved. This is carried over from the original version and
is not yet wired up — approving two overlapping reservations for the same single item will not
warn you.
