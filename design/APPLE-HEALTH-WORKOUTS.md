# Apple Health workout ingest — the phone side (~10 minutes)

The server side is live: `POST /api/health-data/workouts` accepts the
watch's workouts, stores them idempotently (re-runs never duplicate), and
feeds them to the TODAY pane ("Watch today" line), the Coach's context
(with a logged-vs-tracked join check), and the nightly reflection.

## The Shortcut — "Nova Workout Push"

Build once in the Shortcuts app:

1. **Find Health Samples** → choose **Workouts**, filter **Start Date** is
   **today**, Sort by Start Date, Limit off.
2. **Repeat with Each** (item = each workout):
   - **Get Details of Workout** → *Workout Type* → Set variable `wtype`
   - **Get Details of Workout** → *Start Date* → **Format Date** as
     ISO 8601 → variable `wstart`
   - **Get Details of Workout** → *Duration in minutes* → variable `wmin`
   - **Get Details of Workout** → *Active Energy* (kcal) → variable `wkcal`
   - **Text** action:
     `{"type":"[wtype]","startISO":"[wstart]","minutes":[wmin],"kcal":[wkcal]}`
   - (the Repeat's results collect each Text automatically)
3. **Combine Text** → Repeat Results, separator: `,`
4. **Text** →
   `{"date":"[Current Date, format yyyy-MM-dd]","workouts":[[Combined Text]]}`
5. **Get Contents of URL** →
   - URL: `https://<the same Tailscale host the health push uses>/api/health-data/workouts`
   - Method **POST**, Header `Authorization: Bearer <the same token>`,
     Header `Content-Type: application/json`, Request Body: the Text from
     step 4 (as File/Text — the server tolerates both).

## When it runs (pick both)

- **Automation: "When I finish a workout"** (Shortcuts → Automation → New →
  Apple Watch workout ends) → Run "Nova Workout Push", *Ask Before
  Running OFF*. The push lands seconds after any workout ends.
- **Fold into the existing overnight health push**: add steps 1-5 at the
  end of the nightly Shortcut so the day's full list re-syncs (idempotent —
  duplicates are impossible by design).

## Verifying

After the first run: the TODAY tab's hero facts show a "Watch today" line,
`GET /api/health-data/workouts` lists the days, and the pushlog records the
receipt (`kind: "workouts"`). Failures land in the pushlog too, with the
raw body — same debugging surface as the metrics push.
