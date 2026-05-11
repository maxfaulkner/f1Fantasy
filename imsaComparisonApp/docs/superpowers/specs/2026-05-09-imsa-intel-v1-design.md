# IMSA Intel — V1 Design Spec

**Date:** 2026-05-09  
**Status:** Approved for implementation  
**Starting point:** V0 prototype (FastAPI + DuckDB + React/Vite/Plotly)

---

## Context

The V0 app is a functional prototype: three pages (Drivers, Teams, Manufacturers) with basic Plotly charts and a filter bar. It proves the data pipeline works. V1 is the real product — a driver comparison tool with genuine analytical depth, built around the insight that **a driver's fingerprint explains why they dominate certain circuits**.

The dominant feature is Compare. Everything else — Driver profiles, Circuit profiles — exists to enrich and contextualize what you find there.

---

## Navigation

Three pages, clearly ordered by importance:

```
⚡ Compare  |  Drivers  |  Circuits
```

**Compare** carries a visual marker (⚡ or bold styling) to signal it's primary.

**Drivers** and **Circuits** are also reachable contextually from within Compare:
- Clicking a driver pill → opens that driver's profile
- Clicking the circuit name in the event filter → opens that circuit's profile

Teams and Manufacturers views from V0 are removed. The Compare page replaces them with more powerful cross-driver analysis.

---

## Page 1: Compare (Primary)

### Filters

A horizontal filter strip: **Series → Year → Event → Session → Class**

Rules:
- Changing Series resets all downstream filters
- Changing Year resets Event and Class
- Changing Event resets Class
- All filters stored in URL search params (bookmarkable, shareable)

### Driver Selector

2–4 drivers displayed as colored pills (red, blue, green, orange). Each pill shows driver name + car number + team.

Toggle controls (defaults shown):
- `FCY laps hidden` — on by default
- `Out-laps hidden` — on by default  
- `Traffic laps` — off by default (future: detect via position delta)

### Two-Driver Mode (H2H)

When exactly 2 drivers are selected, the full head-to-head layout activates.

**H2H Stat Block**

Side-by-side panel with a VS divider. Stats per driver:
- Best lap time (with `BEST` badge on winner)
- Median race pace
- Pace vs. class field median (%)
- Consistency σ (standard deviation of lap times; `BEST` badge on lower)

**Lap Trace Chart** *(primary chart, full width)*

Plotly line+marker chart. X-axis: lap number. Y-axis: lap time in seconds. One colored trace per driver. FCY/out-laps excluded per toggle state. Uses `Plotly.react()` for in-place updates.

**Sector Breakdown**

Three cards (S1 / S2 / S3), side by side. Each card shows a horizontal bar per driver representing their best-lap sector time, with the faster driver's delta called out below (e.g. "Bamber +0.347s faster"). Pulls from `lap_time_s1`, `lap_time_s2`, `lap_time_s3` — renders only if sector data is non-null for both drivers. If sector data is unavailable, the section is hidden.

**Tire Degradation Chart**

Two overlaid bar/line charts showing median lap time by stint lap number (1 through N). Reveals who peaks earlier and who manages tires longer. Computed from `stint_lap` and `lap_time`, grouped by driver and stint lap, filtered to green-flag laps only. Uses all stints in the session, aggregated by stint_lap position.

**H2H Circuit Record**

A compact table showing every available year the two drivers competed at this circuit in the same class. Only years where both drivers appear in the currently selected class are included — if a driver raced in a different class that year, that year is excluded. Columns: Year · Winner · Margin. Summary line at bottom: "Bamber 3–1 at this circuit." Pulls via a new `/api/compare/h2h` endpoint.

**Distribution**

Plotly box plot, one box per driver. Shows IQR, median, and outliers. Full-width below the other panels.

### Multi-Driver Mode (3–4 Drivers)

When 3 or 4 drivers are selected:
- H2H Stat Block → **Summary Table**: all drivers in columns, same stats as rows
- Lap Trace: all drivers, color-coded, unchanged
- Sector Breakdown: compact ranked view per sector (1st / 2nd / 3rd / 4th with times and deltas)
- Tire Deg: all drivers overlaid, legend identifies each
- H2H Circuit Record: hidden (only meaningful for 2 drivers)
- Distribution: all drivers as box plots

---

## Page 2: Driver Profile

Reached by clicking any driver pill in Compare. Opens as a page (not a modal), with a back arrow returning to Compare with the same filters intact.

### Header

Driver name, nationality flag, license level badge (Platinum/Gold/Silver), series + class.

### Fingerprint Radar

Six-dimensional radar chart (Plotly scatterpolar). Each dimension scored 0–100 relative to the field across all available data for that driver's class.

| Dimension | Computation |
|---|---|
| Qualifying pace | Median lap vs. class field median in qualifying sessions (inverted — faster = higher score) |
| Race pace | Median lap vs. class field median in race sessions |
| Wet pace | Median lap vs. class field median on laps where `raining = TRUE` (null if <20 wet laps) |
| Consistency | Inverse of lap time σ vs. class field σ |
| Tire management | Pace in final 30% of stint vs. first 30% of stint, relative to field |
| Quali→Race delta | Difference between qualifying rank and race pace rank; positive = overperforms in races |

Two drivers can be overlaid on the same radar (when navigating from a 2-driver Compare).

### Dimension Bars

Same six values as the radar, shown as labeled horizontal bars with numeric scores. Easier to read exact values.

### Career Arc

Bar chart: one bar per year, height = driver's median pace percentile within their class that year (higher = faster). Spans all years with ≥ 50 laps in the dataset.

### Best Circuits

Top 5 circuits where the driver most outperforms the class field median (minimum 3 appearances). Shown as a ranked list with the margin.

### Compare Button

Pre-loads this driver into Compare with current filters preserved.

---

## Page 3: Circuit Profile

Reached by clicking the circuit/event name in the event filter. Opens as a page with a back arrow.

### Header

Circuit name, location, track length. Class selector (GTP / GTD / etc.). All-time lap record for selected class: time, holder, year, conditions (dry/wet).

### Track Specialists

Ranked list of drivers by average % above/below class field median at this circuit, across all available years. Minimum 3 race appearances to qualify. Shows name, margin, and number of appearances.

### Manufacturer Affinity

Horizontal bar chart: each manufacturer's median pace vs. class median at this circuit. Reveals which cars suit the track's character.

### Weather Sensitivity

Two numbers: how much rain shifts median lap time here (in seconds and %) vs. the series average rain impact. Helps contextualize whether this is a track where conditions play a big role.

### Compare Specialists Button

Loads the top 2 specialists directly into the Compare page with this circuit pre-selected.

---

## Backend Changes

### New API Endpoints

**`GET /api/compare/h2h`**  
Params: `driver_id_a`, `driver_id_b`, `event`, `class`, `series`  
Returns: year-by-year records at this event for both drivers (best lap per driver per year, winner, margin).

**`GET /api/driver/profile`**  
Params: `driver_id`, `series`, `class`  
Returns: fingerprint scores (6 dimensions), career arc by year, best circuits list.

**`GET /api/circuit/profile`**  
Params: `event`, `series`, `class`  
Returns: all-time record, track specialists, manufacturer affinity, weather sensitivity.

### Modified Endpoints

**`GET /api/compare/drivers`**  
Add `lap_time_s1`, `lap_time_s2`, `lap_time_s3`, `stint_lap`, `raining` to the response. Add pre-computed consistency σ to the `stats` object.

### New Query Functions (`queries.py`)

- `h2h_record(driver_id_a, driver_id_b, event, cls, series)` → year-by-year
- `driver_fingerprint(driver_id, cls, series)` → 6 dimension scores
- `driver_career_arc(driver_id, cls, series)` → by year
- `driver_best_circuits(driver_id, cls, series)` → top 5 circuits
- `circuit_specialists(event, cls, series)` → ranked list
- `circuit_manufacturer_affinity(event, cls, series)` → per-manufacturer median
- `circuit_weather_sensitivity(event, cls, series)` → rain impact

All fingerprint/profile queries read from the unified `laps` view (covers both `imsa.laps` and `impc.laps`).

---

## Frontend Changes

### New Components

- `H2HStatBlock.jsx` — side-by-side stats with VS divider
- `SectorBreakdown.jsx` — three S1/S2/S3 cards
- `TireDegChart.jsx` — pace vs. stint lap, one trace per driver
- `H2HRecord.jsx` — historical circuit record table
- `FingerprintRadar.jsx` — Plotly scatterpolar, 1–2 driver overlay
- `CareerArc.jsx` — yearly pace percentile bar chart
- `CircuitSpecialists.jsx` — ranked specialist list

### New Pages

- `DriverProfile.jsx` — `/drivers/:driver_id`
- `CircuitProfile.jsx` — `/circuits/:event`

### Modified

- `DriverCompare.jsx` — orchestrates 2-driver vs. multi-driver layout switch, adds sector/deg/H2H panels
- `api.js` — new fetch wrappers for h2h, profile, circuit endpoints
- `FilterContext.jsx` — circuit name exposed as a linkable value

### Removed

- `TeamCompare.jsx` and `ManufacturerCompare.jsx` — replaced by Compare page depth
- Associated `/teams` and `/manufacturers` routes and API endpoints

---

## Data Notes

- **Sector times** (`lap_time_s1/s2/s3`): populated in the tobil/imsa dataset; sparse in IMPC scraped data. Sector breakdown panel hidden when null.
- **Raining** (`raining`): populated in tobil dataset; null in IMPC scraped data. Wet pace dimension shows "insufficient data" when < 20 wet laps exist.
- **Stint lap** (`stint_lap`): populated in both datasets. Tire deg chart available for all series.
- **Safety car filtering**: FCY and SF laps excluded from all computations by default (existing behavior).

---

## Out of Scope for V1

- User accounts / saved comparisons
- Live timing / real-time data
- Mobile-optimized layout
- Race narrative / auto-generated text (Direction A from brainstorm)
- Sector time data for IMPC (scraper doesn't capture it)
