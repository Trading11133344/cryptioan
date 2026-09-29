# CryptOrion Security Update

Version: security-2026-09-29

## Required Render environment variables

Keep the existing `DATABASE_URL` unchanged. Add:

- `ADMIN_EMAIL`: operator login email
- `ADMIN_PASSWORD`: a new unique password (16+ characters)

Never commit these values to GitHub.

## Deployment

Replace the repository files with this package, commit to the same `main` branch, then use **Manual Deploy -> Clear build cache & deploy** on the existing Render service. Do not create a new Render service and do not rename the existing service; the URL remains unchanged.

## Verification

- `/api/health` should report `version: security-2026-09-29` and `database: neon-postgresql`.
- An unauthenticated request to `/api/store` should return HTTP 401.
- Existing users sign in with their existing password; it is upgraded to a PBKDF2 hash on successful login.

## Included protections

- PBKDF2-SHA256 password hashing and legacy-password migration
- Random user/admin session tokens
- Per-user data filtering and ownership checks
- Admin action authorization
- Public store endpoint blocked
- API rate limiting and JSON body limit
- CSP and standard security headers
- Browser local-ledger fallback disabled
