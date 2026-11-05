# OWNER DECISIONS

The agent must **not guess** on these. Each has a default so work can proceed; the default is used unless the owner overrides it *in writing at the top of a phase prompt* ("D2 = composite"). If a phase needs a decision that is not settled here, the agent stops at a **STOP-GATE** and asks.

| # | Question | Default (used if not overridden) | Alternative | Affects |
|---|---|---|---|---|
| **D1** | How many customer stations? | **Keep one shared customer selection** (current design: every customer socket edits the same list; last write wins). Document it honestly in README. | **Per-station rooms**: each customer device gets a `station` (URL `?station=2` or saved id); the server keeps one selection per station; managers get a station switcher with live badges; orders record the station. (Prompt P6-B) | P1, P4, P6 |
| **D2** | Identity of Movie / Animation / Iranian items | **Keep `uid = id` string** and make collisions *impossible or loudly reported*: global next-ID generator, cross-type uniqueness check, deterministic winner + diagnostics entry on scan. | **Composite uid `type:id`** (needs a migration for saved orders and browser `localStorage` selections). Only if the owner already has overlapping ID ranges between types. | P3, P4 |
| **D3** | Year for Animation / Iranian | **Parse and keep the year when the filename has one** (1900–2099), show it, but keep the documented sort rules (Iranian ignores year). | Keep discarding it. | P3 |
| **D4** | Poster thumbnails | **Generate cached thumbnails with `sharp` as an *optional* dependency**; fall back to the original file when `sharp` is unavailable (must still work offline / on a machine without build tools). | Serve originals only; only add long-term cache headers. | P8 |
| **D5** | Admin credentials | **First-run setup:** if `data/auth.json` does not exist, the admin password is created from `http://localhost` on the server PC only (loopback), stored as a salted `scrypt` hash. `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars override for headless installs. A "change password" dialog exists in the admin panel. | Keep a default password but force a change at first login. | P1 |
| **D6** | Deleting a movie from the UI | **Soft delete:** move every poster copy to `Library/.trash/<timestamp>/…` with a manifest; the admin can restore the last 20 deletions. | No delete feature (files removed by hand only). | P6 |
| **D7** | Folder name for series | **Accept both `Series` and `Serries`** (case-insensitive). New libraries use `Series`; an existing library keeps whichever folder it already has. | Force rename to `Series`. | P3 |
| **D8** | Minimum Node version | **`>=18`** (`engines`, README, CI). | Keep 14+. | P0, P7 |
| **D9** | Runtime dependencies | **Only `express` and `ws`** at runtime. Dev-only: `eslint`, `playwright`. `sharp` optional (D4). Anything else needs a written justification and a STOP-GATE. | — | all |

## How to override
Put one line at the very top of the prompt you paste, e.g.:

```
OWNER OVERRIDES: D1 = per-station rooms; D6 = no delete feature.
```
