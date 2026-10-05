# 09 · Matching API for the customer screen

The customer describes their nonprofit; the backend returns ranked private foundations with reasons. It is live (`POST /api/match`), free and deterministic: no LLM, no API key, same input gives the same output. `/search` (`web/components/SearchApp.tsx`) is a working reference client. The LLM agent (`/api/agent`) stays disabled: the project makes no paid LLM calls.

Full field reference: `docs/07-BACKEND-API.md`. Types: `Match` and `MatchResponse` in `web/lib/match.ts`, `CriteriaSchema` in `web/lib/criteria.ts`.

## Request

```ts
const res = await fetch("/api/match", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    text: "We fight childhood hunger in East Africa through school meals. Typical ask $30,000.",
    // every field below is optional and overrides what the text implies
    causes: [{ id: "hunger_food", weight: 1 }, { id: "children_youth", weight: 0.7 }],  // ids from GET /api/causes
    states: ["AZ"],          // US states served
    international: true,     // works abroad
    countries: ["KE", "UG"], // refines international
    askUsd: 30000,           // typical request
    requireOpen: true,       // default: only foundations that list application contact info
    limit: 20,               // 1 to 50
  }),
});
const data: MatchResponse = await res.json();   // 400 with { error } on bad input, 503 if the database is down
```

Send `text` alone for a one-box search; add structured fields from form controls. Echo `data.criteria` back to the user ("we read this as: hunger, children, international, ask $30,000") so they can correct it.

## Response (fictional example; real responses carry real foundations and contacts)

```json
{
  "criteria": { "causes": [{ "id": "hunger_food", "weight": 1 }], "states": [], "international": true,
                "countries": ["KE", "UG"], "askUsd": 30000, "requireOpen": true, "limit": 20 },
  "candidates_considered": 3000,
  "results": [{
    "ein": "001234567",
    "name": "EXAMPLE HARVEST FOUNDATION (FICTIONAL)",
    "state": "AZ",
    "score": 78,
    "components": { "cause": 0.91, "geo": 0.84, "size": 1, "openness": 0.6, "capacity": 0.55, "access": 1 },
    "matched_causes": [{ "id": "hunger_food", "label": "Hunger & food security", "share_of_dollars": 0.62, "grants": 41 }],
    "rationale": [
      "62% of its $1,850,000 in grants (41 of 66 grants of $250+) went to Hunger & food security recipients.",
      "48% of its grant dollars went to organizations outside the US (top countries: KE, UG).",
      "Median grant $25,000; middle half $15,000 to $40,000. Your $30,000 is inside its typical range.",
      "30% of its 2025 grantees were new (not funded in the previous 2 tax years); 70% were repeat grantees.",
      "Lists an application contact (Program Office, grants@example.invalid); deadlines: March 1."
    ],
    "open_to_apps": true,
    "contact": { "name": "Program Office", "email": "grants@example.invalid", "phone": null,
                 "deadlines": "March 1", "materials": "Two-page letter of inquiry", "restrictions": null },
    "giving": { "grants_n": 66, "grants_usd": 1850000, "median_grant_usd": 25000, "p25_grant_usd": 15000,
                "p75_grant_usd": 40000, "foreign_share": 0.48, "new_grantee_rate": 0.3, "repeat_grantee_rate": 0.7,
                "years": [2023, 2024, 2025] },
    "top_geography": { "states": ["AZ", "CA"], "countries": ["KE", "UG"] },
    "example_recipients": [{ "name": "Example School Meals Network", "state": null, "country": "KE",
                             "cause": "hunger_food", "usd": 120000 }],
    "prior_outcomes": { "approached": 0, "funded": 0, "declined": 0 }
  }],
  "warnings": [],
  "caveats": ["Cause labels come from the recipient's IRS NTEE code when ..."]
}
```

- `score` is 0 to 100. `components` are 0 to 1; `null` means the user did not give that criterion (it is left out of the score).
- `rationale` lines are built only from the numbers above; show them as written.
- `new_grantee_rate` is `null` when there is no earlier filing to compare: show "unknown", not 0%.
- `example_recipients[].name` is `"Individual recipient (name not stored)"` for grants to people.
- Always show `warnings` and `caveats`.

## Mapping to `web/types/prospect.ts`

| `Prospect` | from `Match` |
|---|---|
| `id` | `ein` |
| `name` | `name` |
| `matchScore` | `score` |
| `typicalGrantMin` / `typicalGrantMax` | `giving.p25_grant_usd` / `giving.p75_grant_usd` (can be null) |
| `focusAreas` | `matched_causes[].label` |
| `geography` | `top_geography.states` + `top_geography.countries` |
| `summary` | `rationale[0]` (or join the lines) |
| `factors[]` | one per non-null `components` entry: `{ label, score: value * 100, confidence }`, with confidence `low` when `giving.grants_n < 10` |
| `evidence[]` | `example_recipients` (type `grant_history`) plus the filing years (type `filing`, `sourceLabel: "IRS Form 990-PF"`) |
| `status` | not from matching: the customer's own pipeline state; record approached / funded / declined with `POST /api/outcomes` |

Foundation detail page: `GET /api/foundations/{ein}` returns the full profile (cause mix, geography, 3-year trend, top recipients).
