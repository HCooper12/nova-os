# Neomas and Ark baselines (Phase 0), 13 Nov 2026

What this is: the seven read-only baselines (B1 to B7) from `design/NEOMAS-ARK-STUDY.md`
section 4, measured before any Phase 1 code changes. Counts and shares only: the repo is
public, so no note titles, note text, search phrases, food names or health values appear here.

How it ran: `scripts/scratch-server.mjs --port 4186` over scratch copies of `server/data`
and the vault (credentials stripped, model CLI stubbed). All HTTP went to
`http://127.0.0.1:4186`; the live server on 4173 was never contacted and the launchd
service was not touched. Node scripts that import `server/lib` set `NOVA_DATA_DIR` and
`VAULT_PATH` to the scratch copies before the first import. Scripts and raw rows stay
outside the repo, in the session scratchpad (`.../scratchpad/baseline/`). Live
`server/data/inbox.json` and the live Review Log kept their modification times.

One deviation to know about: the in-process cross-check in B1 and the replay in B3 let
`server/lib` call the local embedder (Ollama on 127.0.0.1:11434, `nomic-embed-text`).
That is a local embedding call, not a text model, and it wrote only into the scratch copy.

## B1 Search

Sample: 20 phrases of 4 to 7 words from page bodies, 5 each from Concepts, Sources, Topics
and Journal, none inside its page's title or filename (and no phrase word over three
letters appearing in the title).

| Path | Top 5 | Top 1 |
|---|---|---|
| Notes search the app uses today | 0 of 20 | 0 of 20 |
| `GET /api/recall?q=` on the scratch server | 11 of 20 | 6 of 20 |
| `searchVault` in process, with the local embedder | 12 of 20 | 7 of 20 |

- Notes search is a client side title filter: `src/vals/valsNotes.js` lines 21 to 25
  (`searchText: n.title.toLowerCase()`, then `.includes(q)`) over the list from
  `GET /api/notes` (`server/routes/notes.js:7`). It never reads a body, so a phrase absent
  from the title cannot return its note. I reproduced that exact match in the script; 0 of
  the 20 phrases matched any title at all.
- Recall by group, top 5 over HTTP: Concepts 4 of 5, Sources 3 of 5, Topics 4 of 5, Journal 0 of 5.
- The HTTP route (`server/routes/notes.js:82`, `searchVault` limit 6) returned no
  `similarity` field on any result, so the scratch server answered lexically only. The
  embedder only joined in the in-process run.
- Not measured: whether the live server's embedder is up. The result for the live app may sit
  between the two recall rows.

## B2 Map coverage

- Pages the vault holds that the server lists: 1026 (Wiki 830, Raw 196). `GET /api/graph`
  returns 1026 nodes and 4863 links.
- The map: `buildGalaxy` in `src/App.jsx` (line 9496) draws `graph.nodes.slice(0, GALAXY_MAX_NODES)`,
  with the cap of 400 set in `src/galaxyLayout.js:103`. So 400 of 1026 pages are drawn (39%).
- Which 400: the first 400 in vault walk order, which today is all 303 Concepts plus 97 of the
  103 Entities. No Source, Topic, Journal, Health, Inbox, Plan or Raw page is drawn.
- Orphans (no resolvable link): 217 of 1026 overall; 0 among the 400 drawn.
- Handle the code can read (frontmatter author key, or a wikilink to an Entities or Topics
  page): 564 of 1026 (55%); no handle: 462. Counting tags and `sources:` as handles too: 640
  carry one, 386 carry none. Pieces: author key on 3 pages, tags on 626, `sources:` on 425,
  link to an Entity page on 464, link to a Topic page on 439.
- Handle by folder (strict): Concepts 297 of 303, Entities 97 of 103, Sources 108 of 117,
  Topics 18 of 18, Journal 12 of 85, Health 0 of 111, Raw 0 of 196.

## B3 Second-brain audit (the four questions in `design/SECOND-BRAIN-FLAG.md`)

- Vault now: 1026 listed pages (the flag doc said 791 Wiki pages and 185 Raw files on 7 Nov).
- Does a page change an answer, and which pages has no agent read: no persisted record
  exists. The conversation record (`server/data/conversation`, 1301 rows: 154 his, 1134
  Nova's, 13 system) stores `id, at, who, text, via, device` only. Retrieval logs to stdout
  (`server/lib/vaultRetrieve.js:353`), not to disk. Not measured as actually happened.
- Replay as a stand in: I re-ran `retrieveForQuestion` (`server/lib/vaultRetrieve.js:263`) on
  all 154 of his past questions against today's vault copy. 144 of 154 (94%) pull at least one
  page (7 had nothing to search for). 238 distinct pages were pulled; 127 of them more than
  once. Of 501 pages the retrieval allows (`retrievable`), 263 (52%) would never have been
  pulled by any of his questions. This is a simulation on today's vault, not a log of what
  Nova really read.
- Surfaces he does not open: not measured. No server side record of screen opens exists (no
  usage log found under `server/lib` or `server/data`).
- When he asks something the vault could answer, does the answer use it: not measured, needs
  a live trial or a model call.

## B4 Review grades

- Sample size: 1 answer in `Wiki/Library/Review Log.md`. Got it 1, Fuzzy 0, Forgot 0, Read 0.
  The log line does not name a rung; `concept-review.json` shows the one card at step 1
  (GAPS index 0, gap of 1 day, now moved up one step). There is no rung level grade pattern to
  report from one answer. Not measured beyond that.
- `concept-surfaced.json`: 34 pages surfaced; 0 surfaced more than once (max count 1); 0
  dismissed.
- Surfaced per day, last 14 days (from `lastDay`, which equals the surfacing day while every
  count is 1): 31 Oct to 6 Nov 0 each day; 7 Nov 2; 8 Nov 13; 9 Nov 3; 10 Nov 11; 11 Nov 1;
  12 Nov 2; 13 Nov 2. Total 34.

## B5 Check-in replay

- Mondays replayed: 17 (data starts 16 Jul; first Monday 20 Jul, last 9 Nov); all 17 had some health or food data.
- Verdicts: implausible 7, propose 5, not-enough 4, checked 1.
- Not enough data to calibrate: 4 of 17 (the rule: 4 weigh-ins across 14 days and 10 fully
  logged days, `server/lib/fuelReview.js:28-29`). 13 Mondays had 4 or more weigh-ins in
  the 28 day window and 15 had 10 or more complete food days.
- Method: `runFuelReview` cannot be replayed for a past Monday without a code change: it
  reads "now" for the window (`fuelReview.js:181-190`, and `loadCalendarDays` in
  `server/lib/nutritionLog.js:69-73` walks back from `Date.now()`) and skips if the week
  already ran (`:186`). So I fed the pure `reviewNumbers` (`fuelReview.js:57`) the same inputs,
  windowed to the 28 days before each Monday. Caveat: the intake and plan are today's, since
  no history of them is kept, so an old Monday is judged against today's calibration.
- Raw rows (verdict, weigh-in count, health days, food days, complete food days, sessions
  per Monday) are in the scratchpad `b5-raw.json`.

## B6 Food sources

- Window: 15 Aug to 13 Nov 2026 (90 days): 732 food entries across 88 logged days.
- Share by `source`: history 301 (41.1%), scan 223 (30.5%), rotation 164 (22.4%), recipe 32
  (4.4%), described 11 (1.5%), manual 1 (0.1%).
- Fibre present: 0 of 732 entries carry it on the entry, and 0 get it by summing lines.
  At line level 21 of 309 lines (6.8%) have fibre. Only 83 entries have lines at all.
- Sodium present: 0 of 732 entries; 22 of 309 lines (7.1%).
- Most-logged foods (list stays in the scratchpad `b6-raw.json`): of the top 30, 0 are
  generic whole foods, 1 is a borderline plain staple, 17 are branded or packaged, 12 are
  composite meals or bakery items.

## B7 Corrections

No code turns repeated corrections into a standing rule. Three things come close, none counts:
- A rule is filed when he states one, on a single saying: the model emits PROPOSE
  `preference` (`server/lib/claudeCode.js:617`), and his approval writes it through
  `server/lib/inbox.js:428` into Standing Instructions.
- `server/lib/concernClose.js` closes an injury area from one statement of "that is over"
  (`closesArea`, line 96; `closeArea`, line 256, a single call). The header (lines 1 to 8) records that he
  closed the shoulder concern three times in 17 days before this existed, so it fixed the
  symptom with no counter behind it.
- `server/lib/askRoute.js:78` tests a correction with a regex for routing the next answer;
  `profileTalk.js:125` handles "that's wrong" by retracting the last filing. Neither tallies.
`beliefs.js` only lists and lifts rules (its `lift` path near line 383). A count of
corrections per topic is not stored anywhere.
