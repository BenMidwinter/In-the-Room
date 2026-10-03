# In the Room

Spend more time in the work, and less time on the admin.

## Supabase

This repository is linked to the **In the Room** Supabase project.

| | |
| --- | --- |
| Project | [In the Room](https://supabase.com/dashboard/project/wejnkrjrhzzztrrizxai) |
| Ref | `wejnkrjrhzzztrrizxai` |
| Region | `eu-west-2` |
| API URL | `https://wejnkrjrhzzztrrizxai.supabase.co` |

### Local setup

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Add a [personal access token](https://supabase.com/dashboard/account/tokens) and your database password to `.env` (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`).

3. Link the CLI (uses the env vars above):

   ```bash
   npx supabase link --project-ref wejnkrjrhzzztrrizxai
   ```

4. Cursor / agents: `.mcp.json` scopes the Supabase MCP server to this project (`project_ref=wejnkrjrhzzztrrizxai`).
