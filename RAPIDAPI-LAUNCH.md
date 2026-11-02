# Honor BAH — RapidAPI launch checklist (v0.6)

## What v0.6 does

- Keeps direct developer API-key mode locally (`API_MODE=local` default).
- Offers **separate** marketplace gateway mode (`API_MODE=rapidapi`). In that mode only `GET /v1/bah` is protected by a required `X-RapidAPI-Proxy-Secret`. Our server does **not** treat a user-provided `X-RapidAPI-Key` as trustworthy, and does not expose account/usage endpoints to RapidAPI.
- RapidAPI handles consumers' marketplace API keys, quotas, and billing. Configure those in RapidAPI Studio, not in local developer-account plans.
- Does **not** host your API, publish to RapidAPI, or charge customers.

## Test on Windows, without exposing the service

Open PowerShell in the extracted folder:

```powershell
npm.cmd test
$env:API_MODE = 'rapidapi'
$env:RAPIDAPI_PROXY_SECRET = 'LOCAL_TEST_SECRET_CHANGE_BEFORE_DEPLOYMENT_123456'
$env:HOST = '127.0.0.1'
npm.cmd start
```

In a **second** PowerShell window, test the protected endpoint. This local test simulates the gateway; it is NOT a real RapidAPI request:

```powershell
$headers = @{ 'X-RapidAPI-Proxy-Secret' = 'LOCAL_TEST_SECRET_CHANGE_BEFORE_DEPLOYMENT_123456' }
Invoke-RestMethod -Uri 'http://localhost:3000/v1/bah?zip=92136&grade=E-5&dependents=true&year=2026' -Headers $headers
```

Expect monthly_bah 3975 for the included 2026 dataset. A request without the secret should return **403**. Never publish or reuse the example secret. For direct local developer keys, stop server, clear environment (`Remove-Item Env:API_MODE`, `Remove-Item Env:RAPIDAPI_PROXY_SECRET`), and restart.

## When you obtain an HTTPS host

1. Back up the SQLite database (`npm.cmd run backup`) and verify you can restore a backup. Backup files are excluded from GitHub. Configure **persistent storage** for `DB_FILE`. A cloud container's ephemeral disk can erase accounts, keys and usage records. Do not deploy with production accounts until backup and restore have been tested. Consider a managed database for a production release.
2. Set `API_MODE=rapidapi`, `RAPIDAPI_PROXY_SECRET=<secret from RapidAPI Provider Dashboard Security>`, `HOST=0.0.0.0`, and `PORT` as supplied by host. Store the secret in host environment settings, not GitHub. Never put the secret in docs or sample client code.
3. Set HTTPS at the hosting edge. Configure DoD dataset refresh with a scheduled job, monitoring, logs, health probes, and alerts. Test revision and recovery before customer launch.
4. In [RapidAPI Studio](https://rapidapi.com/studio), create an API listing. Set its **Base URL** to your actual hosted origin (not localhost or GitHub Pages). Import `openapi.yaml` for the lookup endpoint. Enable marketplace/RapidAPI authentication and its usage-based plans. Do not add your local `X-API-Key` as a consumer requirement.
5. Find your API's unique **proxy secret** in RapidAPI Provider Security and set the same value on the host. Test a request through the RapidAPI testing console. Confirm that directly calling the public origin without the proxy secret returns 403.
6. Configure marketplace pricing and verify current RapidAPI provider terms, fees, payout requirements, and data usage policy before publishing.

## Security caveats

This is **integration-ready scaffolding**, not a production security certification. A shared proxy-secret check is necessary but insufficient alone for defense in depth. Add host-level firewall or RapidAPI IP allowlisting when possible, secret rotation, request size/time limits, monitoring, backup/restore and load testing. Do not expose the account prototype publicly. Only the BAH lookup and health endpoint should be publicly reachable for the marketplace. If your hosting setup exposes other paths, lock them down at the edge.

BAH rates are published rates for duty-station ZIP codes; an individual's actual entitlement may differ. The API is independent of, and not endorsed by, the Department of Defense.
