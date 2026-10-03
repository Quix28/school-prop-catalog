# School Prop & Costume Catalog

A web app for reserving the school's theatre props and costumes. Students sign up with their
school email address and request items for specific dates; admins approve requests, record
checkouts and returns, and manage the inventory. It runs as a single Next.js server with a
SQLite database and photos on disk, and needs no outside service except an SMTP mailbox.

## Requirements

- A Linux server that you can reach from the internet on ports 80 and 443, and a domain name you
  control. Any distribution works. A Raspberry Pi 4 or 5 with a 64-bit OS is also fine; if you
  use one, put `DATA_DIR` on a USB SSD, because SQLite writes wear out SD cards.
- Node.js 20.9 or newer, as required by Next.js 16. The repository does not pin a version; this
  guide was verified with Node 24.13.1 (`node -v`). Install it so that `node` is at
  `/usr/bin/node` (the NodeSource packages do this), or adjust `ExecStart` in the service file.
- Build tools for `better-sqlite3`, a native module. npm downloads a prebuilt binary for common
  platforms and compiles it from source otherwise, which needs a C++ compiler, make and Python 3.
  The `sqlite3` command-line tool is used for backups. On Debian, Ubuntu or Raspberry Pi OS:

  ```sh
  sudo apt install -y build-essential python3 git sqlite3
  ```

- Memory: `npm run build` can use more than 4 GB of RAM. On a machine with 4 GB or less, add at
  least 2 GB of swap before building.
- [Caddy](https://caddyserver.com/docs/install) as the HTTPS reverse proxy (see
  [Domain and HTTPS](#domain-and-https)).

## Install and build

This guide uses `/srv/prop-catalog`, which is the path `deploy/prop-catalog.service` expects.
Clone, build and run the app as the same non-root account. The build and the admin script open
the database too, so a single owner avoids permission problems.

```sh
sudo mkdir -p /srv/prop-catalog
sudo chown "$USER": /srv/prop-catalog
git clone https://github.com/Quix28/YHP-School-Prop.git /srv/prop-catalog
cd /srv/prop-catalog
npm ci
npm run build
```

`npm run build` runs `next build` and then copies `.next/static` and `public/` into
`.next/standalone/`. The production server is `.next/standalone/server.js`. It carries its own
`node_modules`, including the `better-sqlite3` binary that `npm ci` built for this machine.

## Configuration

```sh
cd /srv/prop-catalog
cp .env.example .env.local
chmod 600 .env.local
nano .env.local
```

The service loads this file through systemd's `EnvironmentFile`. Write one `KEY=value` per line.
Never put a `# comment` on the same line as a value: systemd keeps it as part of the value.

| Variable | What it does | Production value |
|---|---|---|
| `DATA_DIR` | Folder for the database (`catalog.db`) and uploaded photos (`uploads/`). If unset, the server uses `data/` inside `.next/standalone`, and the next build deletes it. | `/srv/prop-catalog/data`, or another absolute path outside `.next/` |
| `ALLOWED_EMAIL_DOMAIN` | Only addresses at this domain can sign up. Once an admin saves the Settings tab, the value stored there is used instead. | The students' email domain, for example `robcol.k12.tr` |
| `COOKIE_SECURE` | Marks the login cookie `Secure`, so browsers only send it over HTTPS. | `true` |
| `PORT` | Port the Node server listens on. Caddy forwards to it. | `3000`, or another free port that matches the Caddyfile |
| `ADMIN_PROMOTE_CODE` | Confirmation code that admins type to save the Settings tab and for every action in the Users tab: role changes, reset links, deactivation and deletion. If empty, those actions are disabled. | A long random string from `openssl rand -hex 16` |
| `TRUST_PROXY` | Takes the client IP from the `X-Forwarded-For` header that the proxy adds. The rate limits on login, sign-up and the confirmation code are keyed on that IP. | `true`, as long as the app is only reachable through Caddy |
| `APP_URL` | Public address used to build links in emails: account confirmation, password reset and reservation updates. | `https://<your domain>` |
| `MAIL_TRANSPORT` | `console` prints email links to the log instead of sending them. It is meant for development and is refused in production. | Remove the line, or set it to `smtp` |
| `SMTP_HOST` | Outgoing mail server. | The school's SMTP server, for example `smtp.office365.com` or `smtp.gmail.com` |
| `SMTP_PORT` | `587` uses STARTTLS; `465` uses TLS from the start. | `587` |
| `SMTP_USER` | SMTP login. | A school-owned mailbox, for example `props@<school domain>` |
| `SMTP_PASS` | Password for that login. | The mailbox password, or an app password if the provider requires one |
| `SMTP_FROM` | Sender name and address on outgoing email. | `"Prop Catalog <props@<school domain>>"`, using an address the mailbox is allowed to send as |

Points to get right:

- `ADMIN_PROMOTE_CODE` must be set, or admins cannot change settings or manage users. Give the
  code to the admins in person. It is never shown in the app.
- `APP_URL=https://<your domain>`. Students get their confirmation links from it, so a wrong
  value breaks sign-up.
- `COOKIE_SECURE=true` and `TRUST_PROXY=true` once Caddy serves the site over HTTPS.
- Send mail through a school-owned account, not a personal one. Students are asked to click
  links in these emails, and mail from a personal address looks like phishing.
- The service file sets `HOSTNAME=127.0.0.1`, so Next.js listens on localhost only and nobody
  can bypass Caddy to forge the `X-Forwarded-For` header. Keep it that way while
  `TRUST_PROXY=true`.

Check the mail settings before going live. The script reads `.env.local` from the current
directory and prints the exact SMTP error if sending fails:

```sh
cd /srv/prop-catalog
node scripts/test-mail.mjs you@<school domain>
```

## Domain and HTTPS

1. Create a DNS A record for the name you want, for example `props.<school domain>`, that points
   to the server's public IPv4 address. Add an AAAA record as well if the server has IPv6.
   `dig +short props.<school domain>` should print the server's address.
2. Allow ports 80 and 443 through any firewall in front of the server. Caddy uses both to get and
   renew the certificate.
3. Install Caddy and replace `/etc/caddy/Caddyfile` with:

   ```
   props.example.org {
       reverse_proxy 127.0.0.1:3000
   }
   ```

   Use your own domain, and the port from `PORT` if you changed it. Then run
   `sudo systemctl reload caddy`. Caddy gets and renews the certificate and redirects `http://`
   to `https://` on its own.

If the server is only reachable inside the school network, Let's Encrypt cannot validate it over
port 80. In that case use the school's own certificate with Caddy's `tls` directive.

The app limits the rate of login and sign-up attempts, checks the type and size of every upload,
and checks the admin role on the server for every admin request. A server that is open to the
internet still needs OS updates. If only staff and students on the school network need it,
restricting access with a firewall or VPN is safer.

## Running as a service

`deploy/prop-catalog.service` is a systemd unit. Copy it and edit the copy:

```sh
sudo cp /srv/prop-catalog/deploy/prop-catalog.service /etc/systemd/system/
sudo nano /etc/systemd/system/prop-catalog.service
```

| Line in the file | Change it to |
|---|---|
| `User=pi` | The account that owns `/srv/prop-catalog` and ran `npm run build`. |
| `WorkingDirectory=/srv/prop-catalog` | The clone directory, if you used another path. |
| `EnvironmentFile=/srv/prop-catalog/.env.local` | The path of `.env.local` from [Configuration](#configuration). |
| `ExecStart=/usr/bin/node .next/standalone/server.js` | Change `/usr/bin/node` only if `which node` prints another path. |
| `Environment=TZ=Europe/Istanbul` | The school's time zone. Reservation dates use the server's local day. |
| `Environment=HOSTNAME=127.0.0.1` | Leave as is when Caddy runs on the same machine. Only change it if the proxy runs on another host, and then allow only that host to reach `PORT`. |
| `ReadWritePaths=-/srv/prop-catalog/data` | Your `DATA_DIR`. The unit makes `/home`, `/usr`, `/boot` and `/etc` read-only; this line keeps `DATA_DIR` writable even if it is under one of them. |

Then start it and check the log:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now prop-catalog
systemctl status prop-catalog
journalctl -u prop-catalog -f
```

`curl -I http://127.0.0.1:3000/login` should return `200`. After that, open
`https://<your domain>` in a browser.

## Database

Everything the app stores is in `DATA_DIR`:

- `catalog.db`: items, reservations, accounts with password hashes, settings and sessions. While
  the server runs, SQLite also keeps `catalog.db-wal` and `catalog.db-shm` next to it.
- `uploads/`: item photos. The database refers to them by file name, so keep the names unchanged.

The server creates both on first start and adds any missing columns when it starts.

### Option A: install the provided database

The project owner hands over a `catalog.db` and an `uploads` folder. Run these commands from the
folder that holds them, replace `<user>` with the service account, and adjust the paths if your
`DATA_DIR` is different:

```sh
sudo systemctl stop prop-catalog
sudo mkdir -p /srv/prop-catalog/data/uploads
sudo rm -f /srv/prop-catalog/data/catalog.db-wal /srv/prop-catalog/data/catalog.db-shm
sudo cp catalog.db /srv/prop-catalog/data/catalog.db
sudo cp -r uploads/. /srv/prop-catalog/data/uploads/
sudo chown -R <user>: /srv/prop-catalog/data
sudo systemctl start prop-catalog
```

Delete the old `-wal` and `-shm` files before copying. SQLite would otherwise try to apply them
to the new database. Accounts in the provided database keep their passwords, so the existing
admins can sign in at `/admin-login` right away.

### Option B: start fresh

Start the service once so it creates an empty database, then create the first admin as the
service account:

```sh
cd /srv/prop-catalog
npm run create-admin
```

This runs `node --env-file=.env.local scripts/create-admin.mjs`, so it writes to the `DATA_DIR`
in `.env.local`. It asks for an email address, a name and a password of at least 6 characters.
If the address already has an account, the script makes it an admin and resets its password.
Sign in at `https://<your domain>/admin-login` and set the site name, email domain and booking
rules in the Settings tab.

## Backups

An admin can download the whole database from Admin > Settings > Download database backup. The
file is a consistent snapshot and contains password hashes, so keep it private. Photos are not
included.

For nightly backups, create a folder the service account can write to and add two lines to that
account's crontab (`crontab -e`). Cron treats `%` as a newline, so it must be written as `\%`:

```sh
sudo mkdir -p /var/backups/prop-catalog
sudo chown <user>: /var/backups/prop-catalog
```

```cron
30 2 * * * sqlite3 /srv/prop-catalog/data/catalog.db ".backup '/var/backups/prop-catalog/catalog-$(date +\%F).db'" && tar czf /var/backups/prop-catalog/uploads-$(date +\%F).tar.gz -C /srv/prop-catalog/data uploads
45 2 * * * find /var/backups/prop-catalog -type f -mtime +30 -delete
```

Use `.backup` instead of `cp` on the live database. A plain copy taken while the server writes
can be inconsistent. Copy the backups to a second machine or school storage as well. To
restore, follow [Option A](#option-a-install-the-provided-database) with the backup file and the
matching uploads archive.

## Updating

Take a backup first, then:

```sh
cd /srv/prop-catalog
git pull
npm ci
npm run build
sudo systemctl restart prop-catalog
```

The build replaces `.next/`, which the running service serves from, so pages can fail until the
restart. For a clean outage, run `sudo systemctl stop prop-catalog` before `npm run build` and
`sudo systemctl start prop-catalog` after it. Nothing in `DATA_DIR` is touched, and the server
adds any new database columns when it starts.

## Troubleshooting

### Emails are not sent

- `journalctl -u prop-catalog` shows the SMTP error for each failed email.
- Run `node scripts/test-mail.mjs you@<school domain>` from `/srv/prop-catalog`.
- If sign-up says "the server cannot send confirmation email", `SMTP_HOST`, `SMTP_USER` or
  `SMTP_PASS` is empty, or `MAIL_TRANSPORT=console` is still set.
- Microsoft 365 answers `535 5.7.139 ... SmtpClientAuthentication is disabled for the Tenant`
  when SMTP AUTH is off, which is Microsoft's default. A tenant admin can turn it on for the
  mailbox with
  `Set-CASMailbox -Identity props@<school domain> -SmtpClientAuthenticationDisabled $false`.
- Google Workspace and Gmail reject the normal account password. Turn on 2-Step Verification,
  create an app password and paste it into `SMTP_PASS` without spaces.
- If the provider rejects or rewrites the sender, set `SMTP_FROM` to an address the mailbox is
  allowed to send as.
- After editing `.env.local`, run `sudo systemctl restart prop-catalog`.

### Links in emails point to the wrong host

Email links are built from `APP_URL`. Set it to `https://<your domain>` and restart the service.
Emails sent before the change keep the old links; students can request a new one at `/verify`
or `/reset-password`.

### Login does not stick behind HTTPS

If sign-in succeeds and the next page sends you back to the login form, the browser dropped the
session cookie.

- With `COOKIE_SECURE=true`, browsers only keep the cookie over HTTPS. Open the site at
  `https://<your domain>`, not over plain `http://`.
- Check that the Caddyfile forwards to the port in `PORT` and that the browser shows a valid
  certificate.

### Permission errors on DATA_DIR

Errors such as `SQLITE_CANTOPEN`, `SQLITE_READONLY`, `attempt to write a readonly database` or
`EACCES` mean the service account cannot write to `DATA_DIR`.

- SQLite creates the `-wal` and `-shm` files next to `catalog.db`, so the service account needs
  write access to the folder itself. Fix ownership with `sudo chown -R <user>: <DATA_DIR>`.
- Files copied with `sudo`, or a database created by running `npm run create-admin` as root,
  belong to root. Run the `chown` again.
- `npm run build` and `npm run create-admin` also open the database. Run them as the service
  account.
- If `DATA_DIR` is under `/home` or another protected path, add it to `ReadWritePaths=` in the
  unit, then run `sudo systemctl daemon-reload` and `sudo systemctl restart prop-catalog`.

### Many students get "Too many sign-up attempts"

Set `TRUST_PROXY=true` and restart. Without it, the app sees every visitor as the same client,
so a class signing up together hits the per-IP sign-up limit.

## Local development

```sh
npm install
cp .env.example .env.local     # the defaults work for local development
npm run create-admin           # asks for the first admin's email and password
npm run dev                    # http://localhost:3000
```

With `MAIL_TRANSPORT=console`, email links are printed to the terminal instead of being sent.
`npm start` runs the production build locally with `./data` as `DATA_DIR`.

Students register at `/signup`; admins sign in at `/admin-login`.

## Accounts and email links

Sign-up sends a confirmation link, and the account cannot sign in until it is confirmed.
Knowing someone's address is therefore not enough to open an account in their name.

Links expire after 24 hours and work once. The link opens a page that asks for the password
chosen at sign-up, and only that step activates the account. Mail scanners such as Microsoft
Safe Links open every link, but opening it changes nothing. If a student registers an address
they don't own, the real owner can still claim it: signing up again overwrites an unconfirmed
registration, and because confirming needs the password, the owner's click can never activate
the other person's password.

Forgot password (`/reset-password`, linked from both sign-in pages) uses the same mail settings.
The link expires after an hour, works once, and signs the account out everywhere. Only
confirmed accounts get one; an unconfirmed sign-up is fixed by signing up again.

## Admin panel

Day-to-day work happens in `/admin` and needs no shell access:

- Items: add, edit (including condition and photo) and delete. Quantity can't go below what is
  booked on the busiest upcoming day.
- CSV: Export CSV downloads every item; Import CSV adds rows as new items. Columns: `name`
  (required), `description`, `category` (prop/costume), `subcategory`, `quantity_total`,
  `condition` (excellent/good/fair/poor), `notes`, `image_url`. Comma or semicolon separated. If
  any row is invalid, nothing is imported.
- Reservations: approve, reject, check out and return, each with an optional note to the
  student. The student gets an email when an admin changes the status. Search by student, item
  or purpose.
- Users: send a password-reset link, deactivate or reactivate, delete, or view someone's
  reservations. Deleting a student with past reservations needs Force delete; open
  reservations always block deletion. Remove an admin role before any of these.
- Settings: site name, allowed email domain (overrides `ALLOWED_EMAIL_DOMAIN`), an announcement
  shown on every page, and student booking rules: maximum length, minimum notice, maximum items
  at once and blocked date ranges. Admins are exempt from the rules.
- Backup: downloads the database (see [Backups](#backups)).

Saving settings and every action in the Users tab need `ADMIN_PROMOTE_CODE`. Secrets such as the
SMTP password and that code stay in `.env.local` on purpose.

## Layout

| Path | Purpose |
|---|---|
| `lib/db.ts` | SQLite connection, schema, WAL and foreign-key pragmas |
| `lib/auth.ts` | scrypt hashing, sessions, `requireUser` / `requireAdmin` guards |
| `lib/ratelimit.ts` | in-memory login and sign-up throttle |
| `lib/client.ts` | browser-side `fetch` wrapper used by the pages |
| `app/api/**` | all database access; the browser never touches SQLite |
| `scripts/create-admin.mjs` | create or promote an admin |
| `scripts/test-mail.mjs` | send a test email with the SMTP settings |
| `deploy/` | systemd unit |

Authorization lives in the API routes. The role checks in the pages only decide where to
redirect. Every admin route checks the session's role again on the server, so a student cannot
reach admin functions by calling the API directly.

## Availability

Nothing stores a running count. A reservation holds its units for its own dates, from the moment
it is requested until it is rejected, cancelled or returned; an overdue checkout keeps holding
until it is marked returned. A request is refused if the units held on the dates it asks for
leave too few free. The catalog's "available today" badge uses the same rule for today only.
