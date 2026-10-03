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

### Setup

```bash
cp .env.example .env
```

`.env.example` already includes the project URL and publishable keys for this project.

- Cursor / agents: `.mcp.json` scopes the Supabase MCP server to `project_ref=wejnkrjrhzzztrrizxai`
- CLI project id: `supabase/config.toml` (`project_id = "in-the-room"`)
- Project ref file: `supabase/.project-ref` (used when the CLI is not logged in)
