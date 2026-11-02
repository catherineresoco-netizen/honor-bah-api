# Honor BAH v0.7 — Render Free / RapidAPI private validation

## What changed
- Bundles the verified 2026 DoD ASCII ZIP in `data/source/` (public, non-secret rate data).
- In RapidAPI mode, application startup verifies official data, imports the bundled archive if necessary, and refuses to start if validation fails. No live DoD download is needed for cold starts.
- `/health` = liveness (200 when server is listening). `/ready` = actual official 2026 data readiness (503 until verified). Both contain no secrets.
- Keeps the existing RapidAPI gateway secret validation and local-mode API key support.

## Deploy
1. Upload this GitHub-ready project's files, preserving folders, to the existing repository root. Never upload `.env`, API keys, live customer databases or secrets. Confirm `data/source/BAH-ASCII-2026.zip` exists in GitHub.
2. In Render, keep Free web service, root directory blank, build command `npm install`, start command `npm start`. No recurring DoD download is required at build.
3. Set secret environment values: `API_MODE=rapidapi`, `RAPIDAPI_PROXY_SECRET` = exact RapidAPI Gateway secret, `HOST=0.0.0.0`, `NODE_ENV=production`. Do not share secret.
4. Deploy latest commit. In logs, look for `Official 2026 BAH dataset ready` and `Honor BAH API v0.7 listening`.
5. Verify `https://honor-bah-api.onrender.com/ready` returns `status: ready`, 2026, and large ZIP/rate counts.
6. Through the *private* RapidAPI Playground, test `/v1/bah?zip=92136&grade=E-5&dependents=true&year=2026` => 200, 3975; test invalid ZIP => 400; missing grade => 400; unsupported ZIP => 404. Do not expose the proxy secret.
7. Trigger a manual Render redeploy and repeat `/ready` to validate cold-start initialization.

## Limits and risks
- This only guarantees the 2026 dataset bundled in the repository can be recreated. New or revised DoD data still requires a reviewed archive refresh and redeployment; do not promise automatic live updates.
- No user/customer storage reliability: Render Free SQLite is ephemeral. In RapidAPI mode we depend on RapidAPI for customers/subscriptions. Local account signup remains disabled in RapidAPI mode.
- Render Free cold-start latency can cause marketplace errors. Do not launch paid subscriptions until reliability and cost monitoring are established.
- Proxy secret is an origin check, not a replacement for additional network restrictions, audit logging, independent security review, or rate tests.
- The bundled archive is a public government dataset, not a secret. Verify usage and attribution terms before public launch.
- `/ready` deliberately exposes only counts, not detailed source paths or the gateway secret.

## Local verification (PowerShell)
`npm.cmd test`
`npm.cmd run data:ensure`
`npm.cmd start`
