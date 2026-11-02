# Honor BAH API v0.7

**Render/RapidAPI launch-readiness update:** See [RENDER-RAPIDAPI-v0.7.md](RENDER-RAPIDAPI-v0.7.md). The verified DoD archive is bundled to repair missing official rate data automatically when starting in RapidAPI mode. Data freshness and paid uptime are not guaranteed.

# Honor BAH API — v0.6 (RapidAPI integration preparation)

See **RAPIDAPI-LAUNCH.md** for tested Windows commands, RapidAPI security configuration, deployment prerequisites and publishing instructions.

Run `npm.cmd test` and `npm.cmd start` locally. The v0.6 package includes official 2026 BAH data.

## Earlier local-development instructions (v0.3–v0.5)

Independent developer API prototype. Local-only with locally managed developer API keys, monthly quotas and usage reporting. No hosting, signup website, or real billing yet.

## Requirements

- Node.js 22.13 or newer (includes `node:sqlite`).
- Windows PowerShell users: use `npm.cmd`, not `npm`, if Windows blocks `npm.ps1`.
- Run all commands from inside the `honor-bah-api` project directory.

## Fast start — Windows (v0.3)

1. Stop the old v0.2 server (`Ctrl+C`) before starting this version. Extract the **new** ZIP completely.
2. Open PowerShell **inside the extracted `honor-bah-api` folder** (the folder with `package.json`).
3. The included `data/bah.sqlite` contains the official 2026 dataset. No data import needed.
4. Run these commands in order:

```powershell
npm.cmd test
npm.cmd run keys:create -- "My First Developer" free
```

**Copy the `hbah_live_...` key from the terminal and keep it private.** The full key appears only at creation; the database stores only its SHA-256 hash. Do not email or publish it.

5. Start the API:

```powershell
npm.cmd start
```

6. In **a second** PowerShell window (in any folder), use your actual key in the header:

```powershell
$headers = @{ "X-API-Key" = "PASTE_YOUR_KEY_HERE" }
Invoke-RestMethod -Uri "http://localhost:3000/v1/bah?zip=92136&grade=E-5&dependents=true&year=2026" -Headers $headers
Invoke-RestMethod -Uri "http://localhost:3000/v1/usage" -Headers $headers
```

**Note:** Pasting the lookup URL directly in a browser now returns `401 INVALID_API_KEY`, because browsers don't attach the custom API key header automatically. This is expected. `/health` still works without a key.

### Developer-key commands

```powershell
npm.cmd run keys:create -- "Demo Developer" free
npm.cmd run keys:create -- "Paying Test Customer" developer
npm.cmd run keys:create -- "Test Company" business
npm.cmd run keys:list
npm.cmd run keys:revoke -- 1
```

`keys:list` shows key ID, prefix, plan and current-month usage, **never the secret**. `keys:revoke` permanently disables that key. Re-create a key if a secret is lost.

### Local plans (not paid subscriptions)

| Plan | Monthly request quota |
| --- | ---: |
| free | 100 |
| developer | 10,000 |
| business | 100,000 |

An authenticated, syntactically valid lookup counts as a request even if the ZIP/rate is missing. Invalid authentication and malformed query parameters do not count. `GET /v1/usage` is free and shows current calendar-month (UTC) quota usage. Exceeding quota returns HTTP `429 PLAN_LIMIT_EXCEEDED`. A disabled/unknown key returns `401 INVALID_API_KEY`. These are **manually assigned demo tiers**; no payments or signup flow are implemented.

### Security / limitations

- **Local development only:** v0.3 listens on `127.0.0.1`, not the public Internet. Do not forward port 3000 or expose this prototype online.
- A reverse proxy with **HTTPS**, secure customer onboarding, payment webhooks, monitoring, backups and production-grade abuse controls will be needed for commercialization.
- Store developer API keys in a secrets manager/secure environment variable, not code or URLs; never commit live keys.
- The included official data is public DoD-derived rate data, but this project is independent and not affiliated with or endorsed by DoD.
- Existing DoD updater commands from v0.2 continue to work, and the new auth tables remain in the same database across a successful update.

## DoD automatic update workflow

2026 DoD archive source:

`https://www.travel.dod.mil/Portals/119/Documents/BAH/BAH_Rates_All_Locations_All_Pay_Grades/ASCII/BAH-ASCII-2026.zip`

Run from the project folder in a **second PowerShell window**:

```powershell
# Check online archive for changes without changing your database:
npm.cmd run update:check

# Download, validate and apply the newest compatible official archive:
npm.cmd run update:apply

# Or apply a local official archive you already downloaded:
node scripts/update-dod.js --file "C:\Users\YOUR_USERNAME\Downloads\BAH-ASCII-2026.zip"
```

**Important**: `update:check` checks the remote archive but does **not** modify the database. `update:apply` fetches the official archive and publishes only after validation. Both commands require internet. Applying a local archive with `--file` works offline.

The updater validates: ZIP structure and size limits, expected exact file names, field counts, numeric rates, grade order, duplicate ZIPs/MHAs, area coverage, pay-grade completeness, dependency status completeness, the known 2026 `TX270` revision, and whether the source SHA-256 changed. It never selects the superseded `bahw_26.dat` by mistake. It stages data in a temporary directory; import runs as one database transaction, rolling back on failure. It preserves the old data if import fails. **Source identity is archive hash**, so changes to content within the archive trigger validation even if the URL stays the same.

### Is it fully automatic right now?

No. The **updater is implemented**, but nothing runs continuously while the API is on your laptop. To automate it, schedule `npm.cmd run update:apply` with Windows Task Scheduler (only when your PC is running), or schedule that same command as a daily cron job on an always-on server after deployment. Schedule it from the project working directory. Failed validation needs an operator to review and resolve it. You should log and alert on failed checks before selling uptime/data freshness to customers.

### What happens next year?

When DoD posts a `BAH-ASCII-2027.zip` in the same format:

```powershell
node scripts/update-dod.js --year 2027 --check
node scripts/update-dod.js --year 2027
```

This adds a new `2027` dataset alongside `2026`. A changed official file format requires code changes and human review. Default lookup queries use `year=2026` until the server is explicitly updated to use a newer default. Pass `year=2027` after importing it. Separate one-off emergency/temporary changes published outside this archive may not appear in the ZIP; this updater monitors **the one ASCII archive**, not every notice or other format on the DoD website.

## API reference

`GET /v1/bah?zip=92136&grade=E-5&dependents=true&year=2026`

- `zip`: five-digit ZIP of **permanent duty station**, not home address.
- `grade`: E-1…E-9, W-1…W-5, O-1E…O-3E, O-1…O-10. O-7 through O-10 share DoD's same published top-grade rate in this ASCII dataset.
- `dependents`: `true` or `false`.
- `year`: 20xx, defaults to 2026 in v0.2.

Successful response includes `monthly_bah`, `annual_bah`, `military_housing_area`, `source` (includes SHA-256), and `dataset_type: official`. Not an individualized entitlement decision. Errors: `VALIDATION_ERROR` (400), `ZIP_NOT_FOUND` (404), `RATE_NOT_FOUND` (404), `DATASET_NOT_LOADED` (503).

For v0.3, `X-API-Key` is **required** for all `/v1/bah` and `/v1/usage` requests. Create separate developer keys via `npm.cmd run keys:create` as explained above. The old single `API_KEY` environment variable is no longer used.

## Developer tests

```powershell
npm.cmd test
```

The automated suite checks request validation, lookup error handling, hashing and revocation of keys, monthly quota enforcement, and HTTP auth/usage responses. The included preloaded database has additionally been verified against the uploaded official DoD ZIP, including the revised Abilene rate, national coverage and no-rate ZIPs.

## Data provenance / limitations

Dataset was imported from a user-supplied `BAH-ASCII-2026.zip`. SHA-256:

`5446fed831e125c23cc6a407dcde4cae541f108e90ac852aaadeec0aa11e515f`

Used *current* `bahw26.txt`, `bahwo26.txt`, `mhanames26.txt`, and `sorted_zipmha26.txt` in that archive. Included 339 named MHAs, 40,959 ZIP mappings, and 18,252 rates (338 areas × 27 grades × 2 statuses). One named MHA (`XX499`) has mappings but no rate values. The May 2026 correction for TX270 E-5 with dependents is $1,872, rather than superseded $1,554.

BAH rates follow eligible duty-station conditions; special circumstances and individual rate protection may change actual payments. This API is not affiliated with or endorsed by DoD. Verify the latest official DoD notices and BAH guidance before making financial decisions.

## Phase 4 — Developer website (v0.4)

Start the server as before:

```powershell
npm.cmd test
npm.cmd start
```

Open **http://localhost:3000/** in your browser. This serves the website and API from the same local server, avoiding cross-origin issues. The website has a homepage, features, API documentation, illustrative pricing, and a **local** developer usage dashboard. Paste a valid API key into the dashboard, click **Check usage**, and it fetches `GET /v1/usage`. The page does **not** persist the key; it clears the input after a successful check. Keys are still created and revoked with PowerShell commands, not in a signup form. No payments are collected.

### Publish the brochure website to GitHub Pages (optional)

The standalone static website files are in `docs/` (`index.html`, `style.css`, `main.js`). In GitHub, create a **separate** repository named `honor-bah-api`, upload only safe source files, and configure **Settings → Pages → Deploy from a branch → main /docs**. GitHub Pages will publish the marketing pages and documentation, but **the interactive dashboard is intentionally disabled on GitHub Pages**. It will not be able to reach your laptop's localhost API. The backend remains local and should not be made public until properly secured and deployed.

**Never upload** `data/bah.sqlite` from your working machine to GitHub (it can contain private API key hashes and usage data); `.gitignore` excludes the file by default. Never upload `.env`, copied live keys, or screenshots showing keys. The website's prices are proposals, not active subscription offerings, and the site's metrics describe the imported 2026 dataset, not real-time guarantees.

## Phase 5A — Local developer accounts (v0.5)

**No paid hosting or billing required.** Open the new **Account** section at
`http://localhost:3000/#accounts` to register a local test developer email and
password (12+ characters), sign in, create up to five Free-plan API keys, view
usage for each key, revoke keys, and sign out. Each newly created key appears
**only once**. The dashboard also supports API-key-based usage checks.

Run on Windows PowerShell from the extracted `honor-bah-api` directory:

```powershell
npm.cmd test
npm.cmd start
```

The packaged `data/bah.sqlite` contains the official 2026 DoD data and starts
without user accounts. If you already have a database with real accounts or keys,
**back it up first**; the database path is configurable with `DB_FILE`.
The new database schema adds account tables and upgrades prior `api_keys`
tables in place; existing CLI-issued keys remain usable but are **not assigned**
to any self-service account. Do not overwrite the old database if you intend to
retain those keys and request counts.

Security design: password hashes use scrypt with unique salts, account sessions
use short-lived (8h) HttpOnly SameSite=Strict cookies, API keys are stored as
SHA-256 digests, and the self-service routes only accept loopback connections.
State-changing account operations require a same-origin Origin header and a
custom CSRF header. Password login has a small per-IP failure limit. The public
GitHub Pages brochure **cannot accept login or passwords**. These controls are
appropriate for a **local prototype**, not a production identity service. Public
hosting would require HTTPS, durable rate limiting, email verification, password
reset flows, audit logging, robust session and account recovery, and a security
review. Don't expose port 3000 to the internet.

To disable new registrations in PowerShell before starting:

```powershell
$env:ENABLE_LOCAL_SIGNUP = "0"
npm.cmd start
```

**GitHub source:** Only publish the safe source package, which excludes
`data/bah.sqlite`, `.env`, sessions and any secrets. After adding the new site
files under `docs/`, GitHub Pages updates the marketing site but intentionally
disables the live account console.
