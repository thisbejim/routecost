# RouteCost

**Use it here: https://thisbejim.github.io/routecost/**

RouteCost is a free, private road-trip cost calculator that turns a route into a realistic trip budget. Add multiple route legs, fuel or EV charging assumptions, tolls, parking, lodging, food, activities and a small buffer, then see the total and per-traveller split.

## The problem

People searching for a trip-cost calculator usually want a decision, not a distance conversion: “Can we afford this drive, and what should each person pay?” The common tools I found answer only “what will the fuel cost?” or push the user into a location search and partner offers.

- [Travelmath’s Cost of Driving Calculator](https://www.travelmath.com/cost-of-driving/) is a useful single-route fuel table, but it is centered on locations, mileage and fuel grade.
- [FindMeTool’s Trip Cost Calculator](https://findmetool.com/tools/trip-cost-calculator/) adds tolls, parking and passenger splitting, but remains a one-distance estimate and includes an affiliate-offer flow.
- [VyzeApps’ road-trip calculator](https://vyzeapps.com/gas-cost-calculator/road-trip) and [CalcToolsBase’s trip calculator](https://calctoolsbase.com/trip-cost-calculator/) reinforce the same one-number fuel/tolls pattern.
- Recent community posts such as [this road-trip calculator request/build signal](https://www.reddit.com/r/u_EmployeeWinter1575/comments/1u82bgs/road_trip_driving/) show people asking for a practical route-and-budget answer rather than another travel inspiration page. This is directional evidence, not fabricated search volume.

The product thesis is: **For people planning a road trip, RouteCost turns a route and a few honest assumptions into a complete, shareable trip budget—fuel or charging, stays, food, tolls and extras—instead of the one-number pump estimate or a signup-heavy travel app.**

## Why this deserves to exist

The gap is not another calculator formula. It is a calmer decision surface: one page, no account, no route tracking, no live-price dependency, and a breakdown that makes the estimate easy to challenge. The tool works when a person has already copied distances from a map and wants to finish the budget in under a minute.

## What is built

- Multi-leg routes with editable names and distances.
- Metric and US/imperial units with reversible conversion.
- Gas/petrol or EV mode, plus an optional side-by-side comparison.
- Tolls, parking, lodging nights, food per person/day and activities.
- Round-trip energy handling, traveller split and an adjustable 0–30% cushion.
- Copyable summary, CSV download, printable result and explicit share-link creation.
- Sample values that explain the interface without requiring an account.
- Offline-capable after load: all prices are user-entered; there are no third-party APIs, ads, analytics, cookies, uploads or backend calls.

## Quality gate

Scores are product/research judgments on a 1–10 scale, not claims of keyword volume. The concept cleared the hard gate before implementation:

| Criterion | Score | Reason |
| --- | ---: | --- |
| Usefulness | 9 | Answers the whole-trip affordability question and splits the bill. |
| Demand | 8 | Repeated calculator intent plus community requests; no invented volume. |
| Intent | 9 | “Trip cost” and “road trip budget” searches are action-oriented. |
| Improvement | 9 | Goes beyond fuel-only tools with legs, extras and EV comparison. |
| Static feasibility | 10 | Pure TypeScript calculations; no server or API required. |
| Zero friction | 9 | Free, immediate, mobile-friendly, no sign-in. |
| Maintainability | 8 | Small vanilla TypeScript app with a tested calculation model. |
| Correctness | 9 | Unit-aware formulas, validation, explicit assumptions and tests. |

## Privacy and independence

RouteCost does not request a location, account, email address or uploaded file. Values are optionally saved in the browser’s local storage. A share link is created only after the user asks for one; it encodes the entered plan in the URL so the user can see exactly what is shared. The app has no analytics, advertising, third-party font request, live-price API or server-side storage.

## Validation

The repository includes Vitest model tests for multi-leg aggregation, round trips, EV energy, unit conversion, validation and cloning. Playwright smoke tests cover the sample flow, editing, EV mode, adding a leg, imperial conversion, share-link creation and an Axe accessibility scan. The production build is generated with Vite and deployed by GitHub Actions to GitHub Pages.

Known limitation: estimates are only as good as the prices and distances entered. RouteCost deliberately does not fetch live traffic, toll or charging prices; confirm those locally before travelling.

## Development

```bash
npm install
npm run dev
npm test
npm run build
npm run test:e2e
```

The app is configured for the `/routecost/` GitHub Pages base path. Deployment is defined in [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml).

## License

MIT. See [`LICENSE`](./LICENSE).
