# Pre-launch checklist

Run through this before pointing a production web domain at In the Room.

## Custom domain / go-live

- [ ] **App env still points at the Supabase project** — After changing the web domain (or hosting target), confirm production `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (or equivalent) still reference the In the Room project (`wejnkrjrhzzztrrizxai` / `https://wejnkrjrhzzztrrizxai.supabase.co`). A domain cutover must not silently point the client at a different or empty Supabase project.
- [ ] **Update `SITE_URL` Edge Function secret** — In Supabase → Project Settings → Edge Functions → Secrets, set `SITE_URL` to the new production origin (e.g. `https://your-domain.com`, no trailing slash). Google OAuth callback redirects users back here (`/settings/integrations`); a stale `localhost` or old domain breaks Connect after launch.

## Google Workspace (if using Connect)

- [ ] Google Cloud OAuth client still has redirect URI  
  `https://wejnkrjrhzzztrrizxai.supabase.co/functions/v1/google-oauth-callback`
- [ ] Google Calendar API enabled on that Google Cloud project
- [ ] Secrets set: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `SITE_URL`, `CREDENTIALS_ENCRYPTION_KEY`
- [ ] Smoke-test **Connect Google Calendar** on the production domain after `SITE_URL` is updated
- [ ] After Connect, Integrations should show the linked Google email (not “No Google account linked”)
- [ ] Calendar should show hatched **Google busy** blocks after connect/sync (Settings → Sync now if empty)
