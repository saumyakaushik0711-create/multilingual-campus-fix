<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Pure business rules (departments, routing threshold, cost, JSON/CSV parsing) live in `src/lib/campusfix.ts` with tests in `src/lib/campusfix.test.ts`; keep UI free of these calculations so they stay testable.
- Groq (OpenAI-compatible chat completions) is called directly from the browser (`src/lib/groq.ts`) with a user-supplied key, because the hackathon brief requires a bring-your-own-key settings modal and no backend.
- The Groq model is chosen at runtime from the live `/models` list (filter and pick rules in `campusfix.ts`, fetch in `groq.ts`) and stored in localStorage; `GROQ_MODEL` is only the fallback, so never hardcode a model in calls.
- Tickets, the API key and the chosen model persist in localStorage, read inside `useEffect` (see `src/hooks/use-campusfix.ts`) to avoid SSR hydration mismatches.
