# IMSA Intel V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the V0 IMSA app into a full analytical product — a feature-rich Compare page with H2H stats, sector breakdown, tire deg, and historical records, plus Driver Profile (fingerprint radar) and Circuit Profile (track specialists) supporting pages.

**Architecture:** FastAPI backend with DuckDB (two ATTACHed databases unified via a `laps` VIEW) serves new query functions for fingerprint scoring, H2H records, and circuit analysis. React frontend organizes around a dominant Compare page that switches between a full H2H layout (2 drivers) and a summary layout (3–4 drivers); Driver and Circuit profile pages are contextually reachable from Compare.

**Tech Stack:** Python 3.14 · FastAPI · DuckDB · pytest · React 19 · Vite · Plotly (plotly.js-dist-min) · react-router-dom v7

---

## File Map

**Backend — created:**
- `backend/tests/__init__.py`
- `backend/tests/conftest.py` — in-memory DuckDB fixture with seeded test data
- `backend/tests/test_queries.py` — tests for all query functions
- `backend/queries_profile.py` — fingerprint, career arc, best circuits, circuit analysis queries
- `backend/routers/profile.py` — `/api/driver/profile` and `/api/circuit/profile` endpoints

**Backend — modified:**
- `backend/queries.py` — extend `compare_drivers` (sectors + σ), add `h2h_record`
- `backend/routers/drivers.py` — add `GET /api/compare/h2h`
- `backend/main.py` — register `profile` router, remove `teams` and `manufacturers` routers

**Backend — deleted:**
- `backend/routers/teams.py`
- `backend/routers/manufacturers.py`

**Frontend — created:**
- `frontend/src/constants.js` — `DRIVER_COLORS`, `SC_FLAGS`
- `frontend/src/components/H2HStatBlock.jsx`
- `frontend/src/components/SectorBreakdown.jsx`
- `frontend/src/components/TireDegChart.jsx`
- `frontend/src/components/H2HRecord.jsx`
- `frontend/src/components/FingerprintRadar.jsx`
- `frontend/src/components/CareerArc.jsx`
- `frontend/src/components/CircuitSpecialists.jsx`
- `frontend/src/components/ManufacturerAffinity.jsx`
- `frontend/src/pages/DriverProfile.jsx`
- `frontend/src/pages/CircuitProfile.jsx`

**Frontend — modified:**
- `frontend/src/api.js` — new wrappers for h2h, driver profile, circuit profile
- `frontend/src/App.jsx` — new routes, remove team/manufacturer routes
- `frontend/src/components/Navbar.jsx` — new nav structure
- `frontend/src/components/EntitySelector.jsx` — 4-driver cap, color-coded pills
- `frontend/src/components/FilterBar.jsx` — event name is a clickable link to circuit profile
- `frontend/src/pages/DriverCompare.jsx` — full rewrite for H2H vs multi-driver layout

**Frontend — deleted:**
- `frontend/src/pages/TeamCompare.jsx`
- `frontend/src/pages/ManufacturerCompare.jsx`

---

## Task 1: Backend test infrastructure

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_queries.py`

- [ ] **Create the test package and conftest with an in-memory DuckDB fixture**

```python
# backend/tests/__init__.py
# (empty)
```

```python
# backend/tests/conftest.py
import pytest
import duckdb


@pytest.fixture
def db():
    conn = duckdb.connect(":memory:")
    conn.execute("""
        CREATE TABLE laps (
            series_code VARCHAR, year VARCHAR, event VARCHAR, session VARCHAR,
            car VARCHAR, class VARCHAR, class_normalized VARCHAR,
            driver_name VARCHAR, driver_id VARCHAR,
            lap INTEGER, lap_time DECIMAL(10,3),
            lap_time_s1 DECIMAL(10,3), lap_time_s2 DECIMAL(10,3), lap_time_s3 DECIMAL(10,3),
            flags VARCHAR, stint_number HUGEINT, stint_lap INTEGER,
            team_name VARCHAR, manufacturer VARCHAR,
            raining BOOLEAN, air_temp_f DECIMAL(6,2), track_temp_f DECIMAL(6,2)
        )
    """)
    rows = []
    # Driver A (bamber): GTP race at Watkins Glen, 2023 and 2024
    for year in ["2023", "2024"]:
        for lap in range(1, 21):
            rows.append(("imsa", year, "Watkins Glen", "race", "10", "GTP", "GTP",
                         "Earl Bamber", "earl bamber", lap,
                         100.0 + lap * 0.1,  # lap_time
                         32.0, 44.0, 24.0,   # sectors
                         "GF", 1, lap, "Porsche", "Porsche", False, 72.0, 85.0))
    # Driver B (tandy): same event
    for year in ["2023", "2024"]:
        for lap in range(1, 21):
            rows.append(("imsa", year, "Watkins Glen", "race", "79", "GTP", "GTP",
                         "Nick Tandy", "nick tandy", lap,
                         100.5 + lap * 0.1,
                         32.3, 44.2, 24.0,
                         "GF", 1, lap, "Porsche", "Porsche", False, 72.0, 85.0))
    # Driver A qualifying laps
    for year in ["2023", "2024"]:
        for lap in range(1, 6):
            rows.append(("imsa", year, "Watkins Glen", "qualifying", "10", "GTP", "GTP",
                         "Earl Bamber", "earl bamber", lap, 99.0 + lap * 0.05,
                         31.8, 43.5, 23.7,
                         "GF", 1, lap, "Porsche", "Porsche", False, 72.0, 85.0))
    # Wet laps (25 laps for wet pace dimension)
    for lap in range(1, 26):
        rows.append(("imsa", "2023", "Sebring", "race", "10", "GTP", "GTP",
                     "Earl Bamber", "earl bamber", lap, 110.0 + lap * 0.2,
                     None, None, None,
                     "GF", 1, lap, "Porsche", "Porsche", True, 65.0, 75.0))
    conn.executemany("INSERT INTO laps VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    return conn
```

- [ ] **Write a smoke-test to confirm the fixture works**

```python
# backend/tests/test_queries.py
def test_fixture_has_data(db):
    count = db.execute("SELECT COUNT(*) FROM laps").fetchone()[0]
    assert count > 0

def test_fixture_has_both_drivers(db):
    drivers = {r[0] for r in db.execute("SELECT DISTINCT driver_id FROM laps").fetchall()}
    assert "earl bamber" in drivers
    assert "nick tandy" in drivers
```

- [ ] **Run the tests — verify they pass**

```bash
cd /Users/maxfaulkner/Documents/GHPython/python/imsaComparisonApp/backend
source .venv/bin/activate
pip install pytest -q
pytest tests/ -v
```

Expected: 2 tests pass.

- [ ] **Commit**

```bash
git add backend/tests/
git commit -m "test: add pytest infrastructure and DuckDB fixture"
```

---

## Task 2: Extend `compare_drivers` — sectors, stint_lap, consistency σ

**Files:**
- Modify: `backend/queries.py`
- Modify: `backend/tests/test_queries.py`

The `compare_drivers` function currently returns `lap_time`, `stint_number`, and `flags` per lap. We need to add `lap_time_s1/s2/s3`, `stint_lap`, plus pre-compute consistency σ in the stats block.

- [ ] **Write the failing test**

```python
# backend/tests/test_queries.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch

def test_compare_drivers_includes_sectors_and_stintlap(db):
    with patch("queries.get_conn", return_value=db):
        import queries
        results = queries.compare_drivers(
            ["earl bamber"], "imsa", "2023", "Watkins Glen", "race", "GTP"
        )
    assert len(results) == 1
    laps = results[0]["laps"]
    assert len(laps) > 0
    assert "lap_time_s1" in laps[0]
    assert "stint_lap" in laps[0]

def test_compare_drivers_stats_includes_sigma(db):
    with patch("queries.get_conn", return_value=db):
        import queries
        results = queries.compare_drivers(
            ["earl bamber", "nick tandy"], "imsa", "2023", "Watkins Glen", "race", "GTP"
        )
    for driver in results:
        assert "sigma" in driver["stats"]
        assert driver["stats"]["sigma"] >= 0
```

- [ ] **Run — verify tests fail**

```bash
pytest tests/test_queries.py::test_compare_drivers_includes_sectors_and_stintlap tests/test_queries.py::test_compare_drivers_stats_includes_sigma -v
```

- [ ] **Update the SQL in `compare_drivers` to include new fields**

In `backend/queries.py`, update the SELECT in `compare_drivers`:

```python
    rows = conn.execute(
        f"""SELECT driver_id, driver_name, car, team_name, lap, lap_time,
                   lap_time_s1, lap_time_s2, lap_time_s3, stint_number, stint_lap, flags
            FROM laps
            WHERE series_code = ? AND year = ? AND event = ? AND session = ? AND class = ?
              AND driver_id IN ({placeholders})
              AND lap_time > 0 AND lap_time < ? {sc}
            ORDER BY driver_id, lap""",
        [series, year, event, session, cls, *driver_ids, cutoff],
    ).fetchall()
```

Update the tuple unpacking and lap dict:

```python
    for driver_id, driver_name, car, team_name, lap, lap_time, \
            s1, s2, s3, stint, stint_lap, flags in rows:
        ...
        by_driver[driver_id]["laps"].append({
            "lap": lap,
            "lap_time": lap_time,
            "lap_time_s1": float(s1) if s1 is not None else None,
            "lap_time_s2": float(s2) if s2 is not None else None,
            "lap_time_s3": float(s3) if s3 is not None else None,
            "stint_number": stint,
            "stint_lap": stint_lap,
            "flags": flags,
        })
```

Add σ to the stats block (after `times_sorted` is computed):

```python
        import statistics
        d["stats"] = {
            "best_lap": times_sorted[0],
            "median_lap": times_sorted[len(times_sorted) // 2],
            "p75_lap": times_sorted[p75_idx],
            "lap_count": len(times),
            "sigma": round(statistics.stdev(times), 3) if len(times) > 1 else 0.0,
        }
```

- [ ] **Run — verify both tests pass**

```bash
pytest tests/test_queries.py::test_compare_drivers_includes_sectors_and_stintlap tests/test_queries.py::test_compare_drivers_stats_includes_sigma -v
```

- [ ] **Commit**

```bash
git add backend/queries.py backend/tests/test_queries.py
git commit -m "feat: extend compare_drivers with sector times, stint_lap, and consistency sigma"
```

---

## Task 3: `h2h_record` query + `/api/compare/h2h` endpoint

**Files:**
- Modify: `backend/queries.py`
- Modify: `backend/routers/drivers.py`
- Modify: `backend/tests/test_queries.py`

- [ ] **Write the failing test**

```python
# backend/tests/test_queries.py
def test_h2h_record_returns_year_by_year(db):
    with patch("queries.get_conn", return_value=db):
        import queries
        result = queries.h2h_record(
            "earl bamber", "nick tandy", "Watkins Glen", "GTP", "imsa"
        )
    assert len(result) == 2  # 2023 and 2024
    years = {r["year"] for r in result}
    assert {"2023", "2024"} == years
    for row in result:
        assert "winner_id" in row
        assert "margin" in row
        assert row["winner_id"] == "earl bamber"  # bamber is faster in fixture
```

- [ ] **Run — verify test fails**

```bash
pytest tests/test_queries.py::test_h2h_record_returns_year_by_year -v
```

- [ ] **Add `h2h_record` to `queries.py`**

```python
def h2h_record(driver_id_a: str, driver_id_b: str, event: str, cls: str, series: str) -> list[dict]:
    sc = _sc_filter()
    rows = get_conn().execute(
        f"""WITH best AS (
                SELECT year,
                       driver_id,
                       MIN(lap_time) as best_lap
                FROM laps
                WHERE series_code = ? AND event = ? AND class = ? AND session ILIKE '%race%'
                  AND driver_id IN (?, ?)
                  AND lap_time > 0 {sc}
                GROUP BY year, driver_id
            ),
            paired AS (
                SELECT a.year,
                       a.best_lap as lap_a,
                       b.best_lap as lap_b
                FROM best a JOIN best b ON a.year = b.year
                WHERE a.driver_id = ? AND b.driver_id = ?
            )
            SELECT year,
                   CASE WHEN lap_a < lap_b THEN ? ELSE ? END as winner_id,
                   ABS(lap_b - lap_a) as margin,
                   lap_a, lap_b
            FROM paired
            ORDER BY year""",
        [series, event, cls, driver_id_a, driver_id_b,
         driver_id_a, driver_id_b, driver_id_a, driver_id_b],
    ).fetchall()
    return [
        {"year": r[0], "winner_id": r[1], "margin": float(r[2]),
         "lap_a": float(r[3]), "lap_b": float(r[4])}
        for r in rows
    ]
```

- [ ] **Run — verify test passes**

```bash
pytest tests/test_queries.py::test_h2h_record_returns_year_by_year -v
```

- [ ] **Add the endpoint to `backend/routers/drivers.py`**

```python
@router.get("/compare/h2h")
def h2h(
    driver_id_a: str,
    driver_id_b: str,
    event: str,
    series: str = "imsa",
    cls: str = Query(alias="class"),
) -> list[dict]:
    return queries.h2h_record(driver_id_a, driver_id_b, event, cls, series)
```

- [ ] **Restart backend and smoke-test the endpoint**

```bash
pkill -f "uvicorn main:app"; source .venv/bin/activate && uvicorn main:app --port 8000 &
sleep 2
curl -s "http://localhost:8000/api/compare/h2h?driver_id_a=earl+bamber&driver_id_b=nick+tandy&event=Watkins+Glen&series=imsa&class=GTP" | python3 -m json.tool | head -20
```

Expected: JSON array with year-by-year records.

- [ ] **Commit**

```bash
git add backend/queries.py backend/routers/drivers.py backend/tests/test_queries.py
git commit -m "feat: add h2h_record query and /api/compare/h2h endpoint"
```

---

## Task 4: Driver profile queries (fingerprint, career arc, best circuits)

**Files:**
- Create: `backend/queries_profile.py`
- Modify: `backend/tests/test_queries.py`

All six fingerprint dimensions use `PERCENT_RANK()` to score 0–100 relative to the field. Higher = better in all dimensions (slow σ → inverted, slow tire deg → inverted).

- [ ] **Write failing tests**

```python
# backend/tests/test_queries.py
def test_driver_fingerprint_returns_six_dimensions(db):
    with patch("queries_profile.get_conn", return_value=db):
        import queries_profile
        result = queries_profile.driver_fingerprint("earl bamber", "GTP", "imsa")
    dims = {"qualifying_pace", "race_pace", "wet_pace", "consistency",
            "tire_management", "quali_race_delta"}
    assert set(result.keys()) == dims
    for k, v in result.items():
        assert v is None or 0 <= v <= 100, f"{k}={v} out of range"

def test_driver_career_arc(db):
    with patch("queries_profile.get_conn", return_value=db):
        import queries_profile
        result = queries_profile.driver_career_arc("earl bamber", "GTP", "imsa")
    assert len(result) >= 1
    for row in result:
        assert "year" in row and "percentile" in row
        assert 0 <= row["percentile"] <= 100

def test_driver_best_circuits(db):
    with patch("queries_profile.get_conn", return_value=db):
        import queries_profile
        result = queries_profile.driver_best_circuits("earl bamber", "GTP", "imsa")
    assert isinstance(result, list)
    # Watkins Glen should appear (driver has 3+ appearances in fixture)
    events = [r["event"] for r in result]
    assert "Watkins Glen" in events
```

- [ ] **Run — verify all three fail**

```bash
pytest tests/test_queries.py::test_driver_fingerprint_returns_six_dimensions tests/test_queries.py::test_driver_career_arc tests/test_queries.py::test_driver_best_circuits -v
```

- [ ] **Create `backend/queries_profile.py`**

```python
import statistics
from db import get_conn


def _pct_rank_score(conn, sql: str, params: list) -> float | None:
    row = conn.execute(sql, params).fetchone()
    if row is None or row[0] is None:
        return None
    return round(float(row[0]) * 100, 1)


def driver_fingerprint(driver_id: str, cls: str, series: str) -> dict:
    conn = get_conn()
    sc_clause = "AND (flags IS NULL OR flags NOT IN ('FCY', 'SF'))"

    # Qualifying pace: PERCENT_RANK where lower lap_time = higher rank
    qual_score = _pct_rank_score(conn, f"""
        WITH medians AS (
            SELECT driver_id, MEDIAN(lap_time) as med
            FROM laps
            WHERE series_code = ? AND class = ? AND session ILIKE '%qual%'
              AND lap_time > 0 {sc_clause}
            GROUP BY driver_id HAVING COUNT(*) >= 3
        ),
        ranked AS (
            SELECT driver_id, PERCENT_RANK() OVER (ORDER BY med DESC) as pct
            FROM medians
        )
        SELECT pct FROM ranked WHERE driver_id = ?
    """, [series, cls, driver_id])

    # Race pace
    race_score = _pct_rank_score(conn, f"""
        WITH medians AS (
            SELECT driver_id, MEDIAN(lap_time) as med
            FROM laps
            WHERE series_code = ? AND class = ? AND session ILIKE '%race%'
              AND lap_time > 0 {sc_clause}
            GROUP BY driver_id HAVING COUNT(*) >= 20
        ),
        ranked AS (
            SELECT driver_id, PERCENT_RANK() OVER (ORDER BY med DESC) as pct
            FROM medians
        )
        SELECT pct FROM ranked WHERE driver_id = ?
    """, [series, cls, driver_id])

    # Wet pace (null if driver has <20 wet laps)
    wet_count = conn.execute(
        f"SELECT COUNT(*) FROM laps WHERE series_code=? AND class=? AND driver_id=? AND raining=TRUE AND lap_time>0 {sc_clause}",
        [series, cls, driver_id]
    ).fetchone()[0]
    if wet_count >= 20:
        wet_score = _pct_rank_score(conn, f"""
            WITH medians AS (
                SELECT driver_id, MEDIAN(lap_time) as med
                FROM laps
                WHERE series_code=? AND class=? AND raining=TRUE AND lap_time>0 {sc_clause}
                GROUP BY driver_id HAVING COUNT(*) >= 20
            ),
            ranked AS (
                SELECT driver_id, PERCENT_RANK() OVER (ORDER BY med DESC) as pct FROM medians
            )
            SELECT pct FROM ranked WHERE driver_id=?
        """, [series, cls, driver_id])
    else:
        wet_score = None

    # Consistency: lower σ = higher score (ORDER BY ASC → higher pct = less consistent, so invert)
    consistency_score = _pct_rank_score(conn, f"""
        WITH stddevs AS (
            SELECT driver_id, STDDEV(lap_time) as sd
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {sc_clause}
            GROUP BY driver_id HAVING COUNT(*) >= 20
        ),
        ranked AS (
            SELECT driver_id, PERCENT_RANK() OVER (ORDER BY sd ASC) as pct FROM stddevs
        )
        SELECT pct FROM ranked WHERE driver_id=?
    """, [series, cls, driver_id])

    # Tire management: pace in final 30% of stint vs first 30%, relative to field
    # Score = how well the driver holds pace late vs field average
    tire_row = conn.execute(f"""
        WITH stint_pace AS (
            SELECT driver_id,
                   AVG(CASE WHEN stint_lap <= 3 THEN lap_time END) as early,
                   AVG(CASE WHEN stint_lap >= 8 THEN lap_time END) as late
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {sc_clause} AND stint_lap IS NOT NULL
            GROUP BY driver_id HAVING COUNT(*) >= 20
        ),
        deltas AS (
            SELECT driver_id, (late - early) / early as deg_pct
            FROM stint_pace WHERE early IS NOT NULL AND late IS NOT NULL
        ),
        ranked AS (
            -- lower deg (holds pace better) = higher score
            SELECT driver_id, PERCENT_RANK() OVER (ORDER BY deg_pct ASC) as pct FROM deltas
        )
        SELECT pct FROM ranked WHERE driver_id=?
    """, [series, cls, driver_id]).fetchone()
    tire_score = round(float(tire_row[0]) * 100, 1) if tire_row and tire_row[0] is not None else None

    # Quali→Race delta: drivers who rank better in race than qualifying
    qr_row = conn.execute(f"""
        WITH qual_ranks AS (
            SELECT driver_id,
                   RANK() OVER (ORDER BY MEDIAN(lap_time)) as q_rank
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%qual%' AND lap_time>0 {sc_clause}
            GROUP BY driver_id HAVING COUNT(*) >= 3
        ),
        race_ranks AS (
            SELECT driver_id,
                   RANK() OVER (ORDER BY MEDIAN(lap_time)) as r_rank
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%' AND lap_time>0 {sc_clause}
            GROUP BY driver_id HAVING COUNT(*) >= 20
        ),
        deltas AS (
            SELECT q.driver_id, (q.q_rank - r.r_rank) as delta
            FROM qual_ranks q JOIN race_ranks r ON q.driver_id = r.driver_id
        ),
        ranked AS (
            SELECT driver_id, PERCENT_RANK() OVER (ORDER BY delta DESC) as pct FROM deltas
        )
        SELECT pct FROM ranked WHERE driver_id=?
    """, [series, cls, series, cls, driver_id]).fetchone()
    qr_score = round(float(qr_row[0]) * 100, 1) if qr_row and qr_row[0] is not None else None

    return {
        "qualifying_pace": qual_score,
        "race_pace": race_score,
        "wet_pace": wet_score,
        "consistency": consistency_score,
        "tire_management": tire_score,
        "quali_race_delta": qr_score,
    }


def driver_career_arc(driver_id: str, cls: str, series: str) -> list[dict]:
    sc = "AND (flags IS NULL OR flags NOT IN ('FCY', 'SF'))"
    rows = get_conn().execute(f"""
        WITH yearly AS (
            SELECT year, driver_id, MEDIAN(lap_time) as med
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {sc}
            GROUP BY year, driver_id HAVING COUNT(*) >= 50
        ),
        ranked AS (
            SELECT year, driver_id,
                   PERCENT_RANK() OVER (PARTITION BY year ORDER BY med DESC) as pct
            FROM yearly
        )
        SELECT year, pct FROM ranked WHERE driver_id=? ORDER BY year
    """, [series, cls, driver_id]).fetchall()
    return [{"year": r[0], "percentile": round(float(r[1]) * 100, 1)} for r in rows]


def driver_best_circuits(driver_id: str, cls: str, series: str) -> list[dict]:
    sc = "AND (flags IS NULL OR flags NOT IN ('FCY', 'SF'))"
    rows = get_conn().execute(f"""
        WITH field AS (
            SELECT event, year, MEDIAN(lap_time) as field_med
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%' AND lap_time>0 {sc}
            GROUP BY event, year
        ),
        driver_ev AS (
            SELECT event, year, MEDIAN(lap_time) as drv_med, COUNT(*) as laps
            FROM laps
            WHERE series_code=? AND class=? AND driver_id=?
              AND session ILIKE '%race%' AND lap_time>0 {sc}
            GROUP BY event, year HAVING COUNT(*) >= 5
        ),
        margins AS (
            SELECT d.event,
                   COUNT(*) as appearances,
                   AVG((f.field_med - d.drv_med) / f.field_med * 100) as avg_margin_pct
            FROM driver_ev d JOIN field f ON d.event=f.event AND d.year=f.year
            GROUP BY d.event HAVING COUNT(*) >= 3
        )
        SELECT event, appearances, avg_margin_pct
        FROM margins ORDER BY avg_margin_pct DESC LIMIT 5
    """, [series, cls, series, cls, driver_id]).fetchall()
    return [{"event": r[0], "appearances": r[1], "margin_pct": round(float(r[2]), 2)} for r in rows]


def driver_profile(driver_id: str, cls: str, series: str) -> dict:
    conn = get_conn()
    meta = conn.execute(
        """SELECT driver_name, license, driver_country
           FROM laps WHERE driver_id=? AND series_code=? AND class=? LIMIT 1""",
        [driver_id, series, cls]
    ).fetchone()
    if not meta:
        return {}
    return {
        "driver_id": driver_id,
        "driver_name": meta[0],
        "license": meta[1],
        "driver_country": meta[2],
        "fingerprint": driver_fingerprint(driver_id, cls, series),
        "career_arc": driver_career_arc(driver_id, cls, series),
        "best_circuits": driver_best_circuits(driver_id, cls, series),
    }
```

- [ ] **Run — verify all three tests pass**

```bash
pytest tests/test_queries.py::test_driver_fingerprint_returns_six_dimensions tests/test_queries.py::test_driver_career_arc tests/test_queries.py::test_driver_best_circuits -v
```

- [ ] **Commit**

```bash
git add backend/queries_profile.py backend/tests/test_queries.py
git commit -m "feat: add driver fingerprint, career arc, and best circuits queries"
```

---

## Task 5: Circuit profile queries

**Files:**
- Modify: `backend/queries_profile.py`
- Modify: `backend/tests/test_queries.py`

- [ ] **Write failing tests**

```python
def test_circuit_specialists(db):
    with patch("queries_profile.get_conn", return_value=db):
        import queries_profile
        result = queries_profile.circuit_specialists("Watkins Glen", "GTP", "imsa")
    assert isinstance(result, list)
    assert len(result) >= 1
    for row in result:
        assert "driver_id" in row and "margin_pct" in row and "appearances" in row

def test_circuit_manufacturer_affinity(db):
    with patch("queries_profile.get_conn", return_value=db):
        import queries_profile
        result = queries_profile.circuit_manufacturer_affinity("Watkins Glen", "GTP", "imsa")
    assert isinstance(result, list)
    assert any(r["manufacturer"] == "Porsche" for r in result)

def test_circuit_weather_sensitivity(db):
    with patch("queries_profile.get_conn", return_value=db):
        import queries_profile
        result = queries_profile.circuit_weather_sensitivity("Sebring", "GTP", "imsa")
    assert "circuit_rain_delta_s" in result
    assert "series_rain_delta_s" in result
```

- [ ] **Run — verify tests fail**

```bash
pytest tests/test_queries.py::test_circuit_specialists tests/test_queries.py::test_circuit_manufacturer_affinity tests/test_queries.py::test_circuit_weather_sensitivity -v
```

- [ ] **Add circuit query functions to `backend/queries_profile.py`**

```python
def circuit_specialists(event: str, cls: str, series: str) -> list[dict]:
    sc = "AND (flags IS NULL OR flags NOT IN ('FCY', 'SF'))"
    rows = get_conn().execute(f"""
        WITH field AS (
            SELECT year, MEDIAN(lap_time) as field_med
            FROM laps
            WHERE series_code=? AND event=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {sc}
            GROUP BY year
        ),
        driver_ev AS (
            SELECT driver_id, driver_name, year, MEDIAN(lap_time) as drv_med
            FROM laps
            WHERE series_code=? AND event=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {sc}
            GROUP BY driver_id, driver_name, year HAVING COUNT(*) >= 5
        ),
        margins AS (
            SELECT d.driver_id, d.driver_name,
                   COUNT(*) as appearances,
                   AVG((f.field_med - d.drv_med) / f.field_med * 100) as margin_pct
            FROM driver_ev d JOIN field f ON d.year=f.year
            GROUP BY d.driver_id, d.driver_name HAVING COUNT(*) >= 3
        )
        SELECT driver_id, driver_name, appearances, margin_pct
        FROM margins ORDER BY margin_pct DESC LIMIT 10
    """, [series, event, cls, series, event, cls]).fetchall()
    return [
        {"driver_id": r[0], "driver_name": r[1],
         "appearances": r[2], "margin_pct": round(float(r[3]), 3)}
        for r in rows
    ]


def circuit_manufacturer_affinity(event: str, cls: str, series: str) -> list[dict]:
    sc = "AND (flags IS NULL OR flags NOT IN ('FCY', 'SF'))"
    rows = get_conn().execute(f"""
        WITH field_med AS (
            SELECT MEDIAN(lap_time) as med
            FROM laps
            WHERE series_code=? AND event=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {sc}
        ),
        mfr AS (
            SELECT manufacturer, MEDIAN(lap_time) as med, COUNT(*) as laps
            FROM laps
            WHERE series_code=? AND event=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {sc} AND manufacturer IS NOT NULL
            GROUP BY manufacturer HAVING COUNT(*) >= 10
        )
        SELECT m.manufacturer,
               (f.med - m.med) / f.med * 100 as delta_pct,
               m.laps
        FROM mfr m, field_med f
        ORDER BY delta_pct DESC
    """, [series, event, cls, series, event, cls]).fetchall()
    return [
        {"manufacturer": r[0], "delta_pct": round(float(r[1]), 3), "laps": r[2]}
        for r in rows
    ]


def circuit_weather_sensitivity(event: str, cls: str, series: str) -> dict:
    sc = "AND (flags IS NULL OR flags NOT IN ('FCY', 'SF'))"
    conn = get_conn()

    def rain_delta(filter_event: str | None) -> float | None:
        event_clause = f"AND event='{filter_event}'" if filter_event else ""
        row = conn.execute(f"""
            SELECT
                AVG(CASE WHEN raining=TRUE THEN lap_time END) -
                AVG(CASE WHEN raining=FALSE THEN lap_time END) as delta
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {sc} {event_clause}
              AND raining IS NOT NULL
        """, [series, cls]).fetchone()
        return float(row[0]) if row and row[0] is not None else None

    circuit_delta = rain_delta(event)
    series_delta = rain_delta(None)
    return {
        "circuit_rain_delta_s": circuit_delta,
        "series_rain_delta_s": series_delta,
    }


def circuit_record(event: str, cls: str, series: str) -> dict | None:
    sc = "AND (flags IS NULL OR flags NOT IN ('FCY', 'SF'))"
    row = get_conn().execute(f"""
        SELECT driver_name, year, MIN(lap_time) as best, raining
        FROM laps
        WHERE series_code=? AND event=? AND class=? AND lap_time>0 {sc}
        ORDER BY best LIMIT 1
    """, [series, event, cls]).fetchone()
    if not row:
        return None
    return {
        "driver_name": row[0], "year": row[1],
        "lap_time": float(row[2]), "wet": bool(row[3])
    }


def circuit_profile(event: str, cls: str, series: str) -> dict:
    return {
        "event": event,
        "record": circuit_record(event, cls, series),
        "specialists": circuit_specialists(event, cls, series),
        "manufacturer_affinity": circuit_manufacturer_affinity(event, cls, series),
        "weather_sensitivity": circuit_weather_sensitivity(event, cls, series),
    }
```

- [ ] **Run — verify all three tests pass**

```bash
pytest tests/test_queries.py -v
```

- [ ] **Commit**

```bash
git add backend/queries_profile.py backend/tests/test_queries.py
git commit -m "feat: add circuit specialists, manufacturer affinity, and weather sensitivity queries"
```

---

## Task 6: New `profile` router + update `main.py`

**Files:**
- Create: `backend/routers/profile.py`
- Modify: `backend/main.py`
- Delete: `backend/routers/teams.py`, `backend/routers/manufacturers.py`

- [ ] **Create `backend/routers/profile.py`**

```python
from fastapi import APIRouter, Query
import queries_profile

router = APIRouter(prefix="/api")


@router.get("/driver/profile")
def get_driver_profile(
    driver_id: str,
    series: str = "imsa",
    cls: str = Query(alias="class"),
) -> dict:
    return queries_profile.driver_profile(driver_id, cls, series)


@router.get("/circuit/profile")
def get_circuit_profile(
    event: str,
    series: str = "imsa",
    cls: str = Query(alias="class"),
) -> dict:
    return queries_profile.circuit_profile(event, cls, series)
```

- [ ] **Update `backend/main.py`** — add profile router, remove teams and manufacturers

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db
from routers import filters, drivers, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.ensure_db()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(filters.router)
app.include_router(drivers.router)
app.include_router(profile.router)
```

- [ ] **Delete the unused routers**

```bash
rm backend/routers/teams.py backend/routers/manufacturers.py
```

- [ ] **Restart backend and verify all endpoints respond**

```bash
pkill -f "uvicorn main:app"
source .venv/bin/activate && uvicorn main:app --port 8000 &
sleep 2
curl -s "http://localhost:8000/api/driver/profile?driver_id=earl+bamber&series=imsa&class=GTP" | python3 -m json.tool | head -15
curl -s "http://localhost:8000/api/circuit/profile?event=Daytona&series=imsa&class=GTP" | python3 -m json.tool | head -15
```

- [ ] **Commit**

```bash
git add backend/routers/profile.py backend/main.py
git rm backend/routers/teams.py backend/routers/manufacturers.py
git commit -m "feat: add profile router, drop teams/manufacturers routers"
```

---

## Task 7: Frontend constants + `api.js` updates

**Files:**
- Create: `frontend/src/constants.js`
- Modify: `frontend/src/api.js`

- [ ] **Create `frontend/src/constants.js`**

```js
export const DRIVER_COLORS = ['#e44', '#5b8dd9', '#4caf50', '#ff9800']
export const SC_FLAGS = ['FCY', 'SF']
```

- [ ] **Replace `frontend/src/api.js` with the full updated version**

```js
async function get(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`)
  return res.json()
}

const qs = (params) =>
  Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')

export const api = {
  seriesList: () => get('/api/filters/series'),
  filters: (series) => get(`/api/filters?series=${series}`),
  events: (series, year) => get(`/api/filters/events?${qs({ series, year })}`),

  drivers: (series, year, event, session, cls) =>
    get(`/api/drivers?${qs({ series, year, event, session, class: cls })}`),

  compareDrivers: (driverIds, series, year, event, session, cls) =>
    get(`/api/compare/drivers?driver_id=${driverIds.join(',')}&${qs({ series, year, event, session, class: cls })}`),

  h2h: (driverIdA, driverIdB, event, series, cls) =>
    get(`/api/compare/h2h?${qs({ driver_id_a: driverIdA, driver_id_b: driverIdB, event, series, class: cls })}`),

  driverProfile: (driverId, series, cls) =>
    get(`/api/driver/profile?${qs({ driver_id: driverId, series, class: cls })}`),

  circuitProfile: (event, series, cls) =>
    get(`/api/circuit/profile?${qs({ event, series, class: cls })}`),

  manufacturers: (series, year, session) =>
    get(`/api/manufacturers?${qs({ series, year, session })}`),
}
```

- [ ] **Commit**

```bash
cd frontend && git add src/constants.js src/api.js
cd .. && git commit -m "feat: add constants and update api.js with h2h and profile wrappers"
```

---

## Task 8: Navigation restructure + remove V0 pages

**Files:**
- Modify: `frontend/src/components/Navbar.jsx`
- Modify: `frontend/src/App.jsx`
- Delete: `frontend/src/pages/TeamCompare.jsx`, `frontend/src/pages/ManufacturerCompare.jsx`

- [ ] **Rewrite `frontend/src/components/Navbar.jsx`**

```jsx
import { NavLink } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav className="navbar">
      <span className="navbar-brand">IMSA Intel</span>
      <div className="navbar-links">
        <NavLink to="/compare" className={({ isActive }) => isActive ? 'active primary' : 'primary'}>
          ⚡ Compare
        </NavLink>
        <NavLink to="/drivers" className={({ isActive }) => isActive ? 'active' : ''}>Drivers</NavLink>
        <NavLink to="/circuits" className={({ isActive }) => isActive ? 'active' : ''}>Circuits</NavLink>
      </div>
    </nav>
  )
}
```

- [ ] **Rewrite `frontend/src/App.jsx`**

```jsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FilterProvider } from './FilterContext'
import Navbar from './components/Navbar'
import DriverCompare from './pages/DriverCompare'
import DriverProfile from './pages/DriverProfile'
import CircuitProfile from './pages/CircuitProfile'

export default function App() {
  return (
    <BrowserRouter>
      <FilterProvider>
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/compare" replace />} />
            <Route path="/compare" element={<DriverCompare />} />
            <Route path="/drivers/:driverId" element={<DriverProfile />} />
            <Route path="/circuits/:event" element={<CircuitProfile />} />
          </Routes>
        </main>
      </FilterProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Delete removed pages**

```bash
rm frontend/src/pages/TeamCompare.jsx frontend/src/pages/ManufacturerCompare.jsx
```

- [ ] **Add `.primary` nav style to `index.css`**

In `frontend/src/index.css`, add after the `.navbar-links a.active` rule:

```css
.navbar-links a.primary {
  font-weight: 600;
  color: var(--accent);
}
.navbar-links a.primary.active {
  background: var(--accent);
  color: #fff;
}
```

- [ ] **Verify the frontend builds without errors**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error|built"
```

Expected: `✓ built in ...`

- [ ] **Commit**

```bash
git add frontend/src/components/Navbar.jsx frontend/src/App.jsx frontend/src/index.css
git rm frontend/src/pages/TeamCompare.jsx frontend/src/pages/ManufacturerCompare.jsx
git commit -m "feat: restructure navigation — Compare primary, add Drivers/Circuits routes"
```

---

## Task 9: EntitySelector — 4-driver cap and color-coded pills

**Files:**
- Modify: `frontend/src/components/EntitySelector.jsx`

The selector needs to: enforce max 4 drivers, communicate each driver's assigned color index back to the parent, and show colored selection states.

- [ ] **Rewrite `frontend/src/components/EntitySelector.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api'
import { useFilters } from '../FilterContext'
import { DRIVER_COLORS } from '../constants'

export default function EntitySelector({ selected, onChange }) {
  const { series, year, event, session, cls } = useFilters()
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!year) return
    setLoading(true)
    setOptions([])
    api.drivers(series, year, event, session, cls)
      .then((data) =>
        setOptions(data.map((d) => ({
          value: d.driver_id,
          label: `${d.driver_name} (#${d.car})`,
          team: d.team_name,
        })))
      )
      .catch(() => setOptions([]))
      .finally(() => setLoading(false))
  }, [series, year, event, session, cls])

  function toggle(value) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else if (selected.length < 4) {
      onChange([...selected, value])
    }
  }

  if (loading) return <div className="entity-selector">Loading drivers...</div>
  if (!options.length) return <div className="entity-selector empty">No drivers found for current filters.</div>

  return (
    <div className="entity-selector">
      <div className="entity-selector-header">
        <span>Select up to 4 drivers</span>
        {selected.length > 0 && (
          <button className="clear-btn" onClick={() => onChange([])}>Clear</button>
        )}
      </div>
      <div className="entity-list">
        {options.map(({ value, label, team }) => {
          const idx = selected.indexOf(value)
          const isSelected = idx !== -1
          const color = isSelected ? DRIVER_COLORS[idx] : null
          return (
            <button
              key={value}
              className={`entity-item ${isSelected ? 'selected' : ''}`}
              style={isSelected ? { background: color, borderColor: color, color: '#fff' } : {}}
              onClick={() => toggle(value)}
              disabled={!isSelected && selected.length >= 4}
              title={team}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/EntitySelector.jsx
git commit -m "feat: EntitySelector — 4-driver cap with DRIVER_COLORS assignment"
```

---

## Task 10: `H2HStatBlock` component

**Files:**
- Create: `frontend/src/components/H2HStatBlock.jsx`

Shown only when exactly 2 drivers are selected. Receives the two driver result objects from `compareDrivers`.

- [ ] **Create `frontend/src/components/H2HStatBlock.jsx`**

```jsx
import { DRIVER_COLORS } from '../constants'

function fmtLap(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`
}

function fmtPct(v) {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

export default function H2HStatBlock({ drivers, fieldMedian }) {
  if (!drivers || drivers.length !== 2) return null
  const [a, b] = drivers

  const rows = [
    {
      label: 'Best Lap',
      a: fmtLap(a.stats.best_lap),
      b: fmtLap(b.stats.best_lap),
      winner: a.stats.best_lap <= b.stats.best_lap ? 'a' : 'b',
    },
    {
      label: 'Median Pace',
      a: fmtLap(a.stats.median_lap),
      b: fmtLap(b.stats.median_lap),
      winner: a.stats.median_lap <= b.stats.median_lap ? 'a' : 'b',
    },
    {
      label: 'vs Field',
      a: fieldMedian ? fmtPct((a.stats.median_lap - fieldMedian) / fieldMedian * 100) : '—',
      b: fieldMedian ? fmtPct((b.stats.median_lap - fieldMedian) / fieldMedian * 100) : '—',
      winner: a.stats.median_lap <= b.stats.median_lap ? 'a' : 'b',
    },
    {
      label: 'Consistency σ',
      a: a.stats.sigma != null ? `${a.stats.sigma.toFixed(3)}s` : '—',
      b: b.stats.sigma != null ? `${b.stats.sigma.toFixed(3)}s` : '—',
      winner: (a.stats.sigma ?? Infinity) <= (b.stats.sigma ?? Infinity) ? 'a' : 'b',
    },
  ]

  return (
    <div className="h2h-stat-block">
      <div className="h2h-col" style={{ '--driver-color': DRIVER_COLORS[0] }}>
        <div className="h2h-name">{a.driver_name}</div>
        {rows.map((r) => (
          <div key={r.label} className={`h2h-cell ${r.winner === 'a' ? 'winner' : ''}`}>
            {r.a}
            {r.winner === 'a' && <span className="best-badge">BEST</span>}
          </div>
        ))}
      </div>
      <div className="h2h-divider">
        {rows.map((r, i) => (
          <div key={i} className="h2h-row-label">{r.label}</div>
        ))}
      </div>
      <div className="h2h-col right" style={{ '--driver-color': DRIVER_COLORS[1] }}>
        <div className="h2h-name">{b.driver_name}</div>
        {rows.map((r) => (
          <div key={r.label} className={`h2h-cell ${r.winner === 'b' ? 'winner' : ''}`}>
            {r.winner === 'b' && <span className="best-badge">BEST</span>}
            {r.b}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Add H2H stat block styles to `index.css`**

```css
.h2h-stat-block {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.h2h-col { padding: 16px 20px; }
.h2h-col.right { text-align: right; }
.h2h-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--driver-color, var(--accent));
  margin-bottom: 12px;
}
.h2h-cell {
  font-family: monospace;
  font-size: 16px;
  color: var(--text-muted);
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 6px;
}
.h2h-col.right .h2h-cell { justify-content: flex-end; }
.h2h-cell.winner { color: var(--driver-color, var(--accent)); font-weight: 600; }
.h2h-divider {
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
}
.h2h-row-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}
.h2h-row-label:first-child { margin-top: 36px; }
.best-badge {
  font-size: 9px;
  font-weight: 800;
  background: var(--driver-color, var(--accent));
  color: #fff;
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.5px;
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/H2HStatBlock.jsx frontend/src/index.css
git commit -m "feat: H2HStatBlock component with winner badges"
```

---

## Task 11: `SectorBreakdown` component

**Files:**
- Create: `frontend/src/components/SectorBreakdown.jsx`

Hidden entirely when sector data is null for either driver.

- [ ] **Create `frontend/src/components/SectorBreakdown.jsx`**

```jsx
import { DRIVER_COLORS } from '../constants'

function bestLapSectors(driver) {
  const laps = driver.laps.filter(
    (l) => l.lap_time_s1 != null && l.lap_time_s2 != null && l.lap_time_s3 != null
  )
  if (!laps.length) return null
  return laps.reduce((best, l) => l.lap_time < best.lap_time ? l : best)
}

export default function SectorBreakdown({ drivers }) {
  if (!drivers?.length) return null

  const sectorData = drivers.map((d) => ({ driver: d, best: bestLapSectors(d) }))
  if (sectorData.some((s) => !s.best)) return null

  const sectors = ['lap_time_s1', 'lap_time_s2', 'lap_time_s3']
  const sectorLabels = ['Sector 1', 'Sector 2', 'Sector 3']

  return (
    <div className="sector-grid">
      {sectors.map((sKey, i) => {
        const times = sectorData.map((s) => s.best[sKey])
        const minTime = Math.min(...times)
        const maxTime = Math.max(...times)
        return (
          <div key={sKey} className="sector-card">
            <div className="sector-label">{sectorLabels[i]}</div>
            {sectorData.map(({ driver, best }, idx) => {
              const t = best[sKey]
              const barWidth = maxTime > minTime
                ? 40 + 60 * (1 - (t - minTime) / (maxTime - minTime))
                : 100
              return (
                <div key={driver.driver_id} className="sector-row">
                  <span className="sector-driver-dot" style={{ background: DRIVER_COLORS[idx] }} />
                  <div className="sector-bar-track">
                    <div
                      className="sector-bar-fill"
                      style={{ width: `${barWidth}%`, background: DRIVER_COLORS[idx] }}
                    />
                  </div>
                  <span className="sector-time">{t.toFixed(3)}</span>
                </div>
              )
            })}
            {(() => {
              const fastest = sectorData.reduce((a, b) =>
                a.best[sKey] < b.best[sKey] ? a : b
              )
              const delta = Math.max(...times) - Math.min(...times)
              return (
                <div className="sector-winner" style={{ color: DRIVER_COLORS[sectorData.indexOf(fastest)] }}>
                  {fastest.driver.driver_name.split(' ').pop()} +{delta.toFixed(3)}s faster
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Add sector styles to `index.css`**

```css
.sector-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.sector-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
.sector-label { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; }
.sector-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.sector-driver-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.sector-bar-track { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.sector-bar-fill { height: 100%; border-radius: 3px; }
.sector-time { font-family: monospace; font-size: 12px; color: var(--text-muted); width: 44px; text-align: right; }
.sector-winner { font-size: 11px; margin-top: 8px; font-weight: 600; }
```

- [ ] **Commit**

```bash
git add frontend/src/components/SectorBreakdown.jsx frontend/src/index.css
git commit -m "feat: SectorBreakdown component — S1/S2/S3 best lap comparison"
```

---

## Task 12: `TireDegChart` component

**Files:**
- Create: `frontend/src/components/TireDegChart.jsx`

Shows median lap time by stint lap position (aggregated across all stints in the session), one Plotly line per driver.

- [ ] **Create `frontend/src/components/TireDegChart.jsx`**

```jsx
import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import { DRIVER_COLORS } from '../constants'

function buildTireDegTraces(drivers) {
  return drivers.map((driver, idx) => {
    const byStintLap = {}
    for (const lap of driver.laps) {
      if (lap.stint_lap == null || lap.flags === 'FCY' || lap.flags === 'SF') continue
      if (!byStintLap[lap.stint_lap]) byStintLap[lap.stint_lap] = []
      byStintLap[lap.stint_lap].push(lap.lap_time)
    }
    const stintLaps = Object.keys(byStintLap).map(Number).sort((a, b) => a - b)
    const medians = stintLaps.map((sl) => {
      const times = byStintLap[sl].sort((a, b) => a - b)
      return times[Math.floor(times.length / 2)]
    })
    return {
      x: stintLaps,
      y: medians,
      name: driver.driver_name,
      mode: 'lines+markers',
      marker: { size: 5, color: DRIVER_COLORS[idx] },
      line: { color: DRIVER_COLORS[idx] },
      hovertemplate: 'Stint lap %{x}<br>Median: %{y:.3f}s<extra>%{fullData.name}</extra>',
    }
  })
}

export default function TireDegChart({ drivers }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !drivers?.length) return
    const traces = buildTireDegTraces(drivers)
    if (traces.every((t) => t.x.length === 0)) return
    Plotly.react(ref.current, traces, {
      xaxis: { title: 'Stint Lap', zeroline: false, dtick: 1 },
      yaxis: { title: 'Median Lap Time (s)', autorange: true },
      legend: { orientation: 'h', y: -0.2 },
      margin: { t: 10, r: 20, b: 60, l: 70 },
      hovermode: 'x unified',
    }, { responsive: true, displayModeBar: false })
  }, [drivers])

  if (!drivers?.length) return null
  return <div ref={ref} className="chart" />
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/TireDegChart.jsx
git commit -m "feat: TireDegChart — median pace by stint lap position"
```

---

## Task 13: `H2HRecord` component

**Files:**
- Create: `frontend/src/components/H2HRecord.jsx`

- [ ] **Create `frontend/src/components/H2HRecord.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api'
import { useFilters } from '../FilterContext'
import { DRIVER_COLORS } from '../constants'

function fmtLap(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`
}

export default function H2HRecord({ drivers }) {
  const { series, event, cls } = useFilters()
  const [records, setRecords] = useState(null)

  useEffect(() => {
    if (!drivers || drivers.length !== 2 || !event || !cls) return
    setRecords(null)
    api.h2h(drivers[0].driver_id, drivers[1].driver_id, event, series, cls)
      .then(setRecords)
      .catch(() => setRecords([]))
  }, [drivers, series, event, cls])

  if (!records || !records.length) return null

  const aWins = records.filter((r) => r.winner_id === drivers[0].driver_id).length
  const bWins = records.length - aWins

  return (
    <div className="chart-box">
      <div className="section-label" style={{ marginBottom: 12 }}>
        H2H at this circuit · {records.length} meeting{records.length !== 1 ? 's' : ''}
      </div>
      <table className="summary-table">
        <thead>
          <tr>
            <th>Year</th>
            <th style={{ color: DRIVER_COLORS[0] }}>{drivers[0].driver_name.split(' ').pop()}</th>
            <th style={{ color: DRIVER_COLORS[1] }}>{drivers[1].driver_name.split(' ').pop()}</th>
            <th>Winner</th>
            <th>Margin</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const isAWinner = r.winner_id === drivers[0].driver_id
            return (
              <tr key={r.year}>
                <td>{r.year}</td>
                <td style={{ color: DRIVER_COLORS[0] }}>{fmtLap(r.lap_a)}</td>
                <td style={{ color: DRIVER_COLORS[1] }}>{fmtLap(r.lap_b)}</td>
                <td style={{ color: isAWinner ? DRIVER_COLORS[0] : DRIVER_COLORS[1], fontWeight: 700 }}>
                  {r.winner_id.split(' ').pop()}
                </td>
                <td>{r.margin.toFixed(3)}s</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="h2h-record-summary">
        <span style={{ color: DRIVER_COLORS[0] }}>{drivers[0].driver_name.split(' ').pop()} {aWins}</span>
        {' – '}
        <span style={{ color: DRIVER_COLORS[1] }}>{bWins} {drivers[1].driver_name.split(' ').pop()}</span>
        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>at this circuit</span>
      </div>
    </div>
  )
}
```

- [ ] **Add H2H record summary style to `index.css`**

```css
.h2h-record-summary {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
}
.section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.chart-box {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/H2HRecord.jsx frontend/src/index.css
git commit -m "feat: H2HRecord component — year-by-year circuit matchup history"
```

---

## Task 14: Rewrite `DriverCompare` page — H2H vs multi-driver layout

**Files:**
- Modify: `frontend/src/pages/DriverCompare.jsx`

This page orchestrates all the compare components. When 2 drivers: full H2H layout. When 3–4: summary table + simplified charts.

- [ ] **Rewrite `frontend/src/pages/DriverCompare.jsx`**

```jsx
import { useEffect, useState, useMemo } from 'react'
import { api } from '../api'
import { useFilters } from '../FilterContext'
import { DRIVER_COLORS } from '../constants'
import FilterBar from '../components/FilterBar'
import EntitySelector from '../components/EntitySelector'
import H2HStatBlock from '../components/H2HStatBlock'
import SectorBreakdown from '../components/SectorBreakdown'
import TireDegChart from '../components/TireDegChart'
import H2HRecord from '../components/H2HRecord'
import LapTraceChart from '../components/LapTraceChart'
import DistributionChart from '../components/DistributionChart'
import SummaryTable from '../components/SummaryTable'
import LoadingSpinner from '../components/LoadingSpinner'

function fieldMedian(results) {
  const all = results.flatMap((d) => d.laps.map((l) => l.lap_time)).sort((a, b) => a - b)
  return all.length ? all[Math.floor(all.length / 2)] : null
}

export default function DriverCompare() {
  const { series, year, event, session, cls } = useFilters()
  const [selected, setSelected] = useState([])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const isH2H = results?.length === 2

  useEffect(() => { setSelected([]); setResults(null) }, [series, year, event, session, cls])

  useEffect(() => {
    if (!selected.length || !year || !event || !session || !cls) { setResults(null); return }
    setLoading(true)
    api.compareDrivers(selected, series, year, event, session, cls)
      .then(setResults)
      .catch(() => setResults(null))
      .finally(() => setLoading(false))
  }, [selected, series, year, event, session, cls])

  const fm = useMemo(() => results ? fieldMedian(results) : null, [results])

  return (
    <div className="page">
      <FilterBar />
      <EntitySelector selected={selected} onChange={setSelected} />
      {loading && <LoadingSpinner />}

      {results && (
        <>
          {isH2H ? (
            <H2HStatBlock drivers={results} fieldMedian={fm} />
          ) : (
            <SummaryTable data={results} />
          )}

          <LapTraceChart data={results} colors={DRIVER_COLORS} />

          {isH2H && <SectorBreakdown drivers={results} />}

          <TireDegChart drivers={results} />

          {isH2H && <H2HRecord drivers={results} />}

          <DistributionChart data={results} colors={DRIVER_COLORS} />
        </>
      )}

      {!loading && !results && selected.length > 0 && (
        <p className="hint">Select an event and class to load lap data.</p>
      )}
    </div>
  )
}
```

- [ ] **Update `LapTraceChart` and `DistributionChart` to accept a `colors` prop**

In `frontend/src/components/LapTraceChart.jsx`, replace the hardcoded color with the prop:

```jsx
export default function LapTraceChart({ data, colors }) {
  // inside the traces map:
  const traces = data.map((driver, idx) => ({
    // ...existing fields...
    line: { color: colors?.[idx] ?? '#888' },
    marker: { size: 4, color: colors?.[idx] ?? '#888' },
  }))
```

In `frontend/src/components/DistributionChart.jsx`:

```jsx
export default function DistributionChart({ data, nameKey = 'driver_name', timesKey = null, colors }) {
  const traces = data.map((entity, idx) => ({
    // ...existing fields...
    marker: { color: colors?.[idx] ?? '#888' },
  }))
```

- [ ] **Open browser at http://localhost:5174/compare — verify layout renders for 2 and 4 drivers**

Select 2 drivers → confirm H2H stat block, sector cards, tire deg, H2H record all appear.  
Select 3 drivers → confirm summary table replaces H2H block, H2H record is hidden.

- [ ] **Commit**

```bash
git add frontend/src/pages/DriverCompare.jsx frontend/src/components/LapTraceChart.jsx frontend/src/components/DistributionChart.jsx
git commit -m "feat: DriverCompare full H2H layout with all compare panels"
```

---

## Task 15: `FingerprintRadar` and `CareerArc` components

**Files:**
- Create: `frontend/src/components/FingerprintRadar.jsx`
- Create: `frontend/src/components/CareerArc.jsx`

- [ ] **Create `frontend/src/components/FingerprintRadar.jsx`**

```jsx
import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import { DRIVER_COLORS } from '../constants'

const DIMS = [
  { key: 'qualifying_pace', label: 'Qualifying' },
  { key: 'race_pace', label: 'Race Pace' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'tire_management', label: 'Tire Mgmt' },
  { key: 'quali_race_delta', label: 'Race Boost' },
  { key: 'wet_pace', label: 'Wet Pace' },
]

export default function FingerprintRadar({ profiles }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !profiles?.length) return
    const theta = [...DIMS.map((d) => d.label), DIMS[0].label]
    const traces = profiles.map((p, idx) => ({
      type: 'scatterpolar',
      r: [...DIMS.map((d) => p.fingerprint[d.key] ?? 0), p.fingerprint[DIMS[0].key] ?? 0],
      theta,
      name: p.driver_name,
      fill: 'toself',
      fillcolor: `${DRIVER_COLORS[idx]}33`,
      line: { color: DRIVER_COLORS[idx], width: 2 },
    }))
    Plotly.react(ref.current, traces, {
      polar: {
        radialaxis: { visible: true, range: [0, 100], tickfont: { size: 10 } },
        angularaxis: { tickfont: { size: 11 } },
      },
      legend: { orientation: 'h', y: -0.15 },
      margin: { t: 20, r: 40, b: 60, l: 40 },
    }, { responsive: true, displayModeBar: false })
  }, [profiles])

  if (!profiles?.length) return null
  return <div ref={ref} style={{ height: 340 }} />
}
```

- [ ] **Create `frontend/src/components/CareerArc.jsx`**

```jsx
import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import { DRIVER_COLORS } from '../constants'

export default function CareerArc({ profiles }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !profiles?.length) return
    const traces = profiles.map((p, idx) => ({
      x: p.career_arc.map((r) => r.year),
      y: p.career_arc.map((r) => r.percentile),
      name: p.driver_name,
      type: 'bar',
      marker: { color: DRIVER_COLORS[idx] },
      hovertemplate: '%{x}: %{y:.1f}th percentile<extra>%{fullData.name}</extra>',
    }))
    Plotly.react(ref.current, traces, {
      barmode: 'group',
      xaxis: { title: 'Year', type: 'category' },
      yaxis: { title: 'Pace Percentile (higher = faster)', range: [0, 100] },
      legend: { orientation: 'h', y: -0.2 },
      margin: { t: 10, r: 20, b: 60, l: 60 },
    }, { responsive: true, displayModeBar: false })
  }, [profiles])

  if (!profiles?.length) return null
  return <div ref={ref} className="chart" />
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/FingerprintRadar.jsx frontend/src/components/CareerArc.jsx
git commit -m "feat: FingerprintRadar and CareerArc components"
```

---

## Task 16: `DriverProfile` page

**Files:**
- Create: `frontend/src/pages/DriverProfile.jsx`

- [ ] **Create `frontend/src/pages/DriverProfile.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useFilters } from '../FilterContext'
import FingerprintRadar from '../components/FingerprintRadar'
import CareerArc from '../components/CareerArc'
import LoadingSpinner from '../components/LoadingSpinner'

const LICENSE_COLOR = { Platinum: '#b0c4de', Gold: '#ffd700', Silver: '#c0c0c0', Bronze: '#cd7f32' }

export default function DriverProfile() {
  const { driverId } = useParams()
  const { series, cls } = useFilters()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!driverId || !cls) return
    setLoading(true)
    api.driverProfile(driverId, series, cls)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [driverId, series, cls])

  if (loading) return <div className="page"><LoadingSpinner /></div>
  if (!profile || !profile.driver_name) return <div className="page"><p className="hint">Driver not found.</p></div>

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>

      <div className="profile-header">
        <div className="profile-avatar">
          {profile.driver_name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
        </div>
        <div>
          <h2 style={{ margin: 0 }}>{profile.driver_name}</h2>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {profile.driver_country && <span className="tag">{profile.driver_country}</span>}
            {profile.license && (
              <span className="tag" style={{ borderColor: LICENSE_COLOR[profile.license] ?? '#555', color: LICENSE_COLOR[profile.license] ?? '#999' }}>
                {profile.license}
              </span>
            )}
            <span className="tag">{cls}</span>
            <span className="tag">{series.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <div className="section-label" style={{ marginBottom: 8 }}>Performance Fingerprint</div>
      <FingerprintRadar profiles={[profile]} />

      {/* Dimension bars — same data as radar, easier to read exact scores */}
      <div className="dimension-bars">
        {[
          { key: 'qualifying_pace', label: 'Qualifying Pace' },
          { key: 'race_pace', label: 'Race Pace' },
          { key: 'consistency', label: 'Consistency' },
          { key: 'tire_management', label: 'Tire Management' },
          { key: 'quali_race_delta', label: 'Race Boost' },
          { key: 'wet_pace', label: 'Wet Pace' },
        ].map(({ key, label }) => {
          const val = profile.fingerprint[key]
          return (
            <div key={key} className="dim-row">
              <span className="dim-label">{label}</span>
              <div className="dim-bar-track">
                {val != null && <div className="dim-bar-fill" style={{ width: `${val}%` }} />}
              </div>
              <span className="dim-val">{val != null ? val.toFixed(0) : '—'}</span>
            </div>
          )
        })}
      </div>

      <div className="section-label" style={{ marginBottom: 8 }}>Career Arc — pace percentile by year</div>
      <CareerArc profiles={[profile]} />

      {profile.best_circuits?.length > 0 && (
        <>
          <div className="section-label" style={{ marginBottom: 8 }}>Best Circuits</div>
          <table className="summary-table">
            <thead>
              <tr><th>Circuit</th><th>Appearances</th><th>Avg margin vs field</th></tr>
            </thead>
            <tbody>
              {profile.best_circuits.map((c) => (
                <tr key={c.event}>
                  <td>{c.event}</td>
                  <td>{c.appearances}</td>
                  <td style={{ color: c.margin_pct > 0 ? '#4caf50' : 'var(--accent)', fontFamily: 'monospace' }}>
                    {c.margin_pct > 0 ? '+' : ''}{c.margin_pct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <button
        className="mock-button"
        style={{ marginTop: 8 }}
        onClick={() => navigate(`/compare?${searchParams.toString()}`)}
      >
        Compare this driver →
      </button>
    </div>
  )
}
```

- [ ] **Add profile page styles to `index.css`**

```css
.back-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 16px;
}
.back-btn:hover { color: var(--text); }
.profile-header { display: flex; align-items: center; gap: 16px; }
.profile-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-weight: 800;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tag {
  display: inline-block;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 12px;
  color: var(--text-muted);
}
.dimension-bars { display: flex; flex-direction: column; gap: 8px; }
.dim-row { display: flex; align-items: center; gap: 12px; }
.dim-label { font-size: 13px; color: var(--text-muted); width: 140px; flex-shrink: 0; }
.dim-bar-track { flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
.dim-bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
.dim-val { font-size: 13px; font-family: monospace; color: var(--text); width: 32px; text-align: right; }
.mock-button {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Wire up driver pill navigation in `EntitySelector`**

In `EntitySelector.jsx`, import `useNavigate` and `useSearchParams`. Add a small info button to each selected pill that navigates to the driver profile:

```jsx
import { useNavigate, useSearchParams } from 'react-router-dom'
// inside EntitySelector:
const navigate = useNavigate()
const [searchParams] = useSearchParams()

// In the selected pill render, add:
{isSelected && (
  <span
    style={{ marginLeft: 4, cursor: 'pointer', opacity: 0.8 }}
    onClick={(e) => { e.stopPropagation(); navigate(`/drivers/${encodeURIComponent(value)}?${searchParams}`) }}
    title="View driver profile"
  >↗</span>
)}
```

- [ ] **Open http://localhost:5174/drivers/earl%20bamber?class=GTP&series=imsa — verify profile loads**

- [ ] **Commit**

```bash
git add frontend/src/pages/DriverProfile.jsx frontend/src/components/EntitySelector.jsx frontend/src/index.css
git commit -m "feat: DriverProfile page with fingerprint radar, career arc, best circuits"
```

---

## Task 17: `CircuitSpecialists`, `ManufacturerAffinity`, and `CircuitProfile` page

**Files:**
- Create: `frontend/src/components/CircuitSpecialists.jsx`
- Create: `frontend/src/components/ManufacturerAffinity.jsx`
- Create: `frontend/src/pages/CircuitProfile.jsx`

- [ ] **Create `frontend/src/components/CircuitSpecialists.jsx`**

```jsx
export default function CircuitSpecialists({ specialists }) {
  if (!specialists?.length) return null
  return (
    <table className="summary-table">
      <thead>
        <tr><th>#</th><th>Driver</th><th>Appearances</th><th>Avg margin vs field</th></tr>
      </thead>
      <tbody>
        {specialists.map((s, i) => (
          <tr key={s.driver_id}>
            <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
            <td>{s.driver_name}</td>
            <td>{s.appearances}</td>
            <td style={{ color: s.margin_pct > 0 ? '#4caf50' : 'var(--accent)', fontFamily: 'monospace' }}>
              {s.margin_pct > 0 ? '+' : ''}{s.margin_pct.toFixed(2)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Create `frontend/src/components/ManufacturerAffinity.jsx`**

```jsx
import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'

export default function ManufacturerAffinity({ data }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !data?.length) return
    const sorted = [...data].sort((a, b) => b.delta_pct - a.delta_pct)
    Plotly.react(ref.current, [{
      x: sorted.map((d) => d.delta_pct),
      y: sorted.map((d) => d.manufacturer),
      type: 'bar',
      orientation: 'h',
      marker: { color: sorted.map((d) => d.delta_pct > 0 ? '#4caf50' : '#e44') },
      hovertemplate: '%{y}: %{x:+.3f}%<extra></extra>',
    }], {
      xaxis: { title: 'vs class median (%)', zeroline: true, zerolinecolor: '#444' },
      yaxis: { automargin: true },
      margin: { t: 10, r: 20, b: 50, l: 120 },
    }, { responsive: true, displayModeBar: false })
  }, [data])

  if (!data?.length) return null
  return <div ref={ref} className="chart" />
}
```

- [ ] **Create `frontend/src/pages/CircuitProfile.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { api } from '../api'
import { useFilters } from '../FilterContext'
import CircuitSpecialists from '../components/CircuitSpecialists'
import ManufacturerAffinity from '../components/ManufacturerAffinity'
import LoadingSpinner from '../components/LoadingSpinner'

function fmtLap(s) {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`
}

export default function CircuitProfile() {
  const { event } = useParams()
  const decodedEvent = decodeURIComponent(event)
  const { series, cls, universe } = useFilters()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [profile, setProfile] = useState(null)
  const [profileCls, setProfileCls] = useState(cls || 'GTP')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!decodedEvent) return
    setLoading(true)
    api.circuitProfile(decodedEvent, series, profileCls)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [decodedEvent, series, profileCls])

  const top2 = profile?.specialists?.slice(0, 2) ?? []

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{decodedEvent}</h2>
          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
            {universe?.classes.map((c) => (
              <button
                key={c}
                className="tag"
                style={{ cursor: 'pointer', background: c === profileCls ? 'var(--accent)' : undefined, color: c === profileCls ? '#fff' : undefined, border: c === profileCls ? '1px solid var(--accent)' : undefined }}
                onClick={() => setProfileCls(c)}
              >{c}</button>
            ))}
          </div>
        </div>
        {profile?.record && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>
              {fmtLap(profile.record.lap_time)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              All-time {profileCls} record · {profile.record.driver_name} · {profile.record.year}
              {profile.record.wet ? ' · Wet' : ' · Dry'}
            </div>
          </div>
        )}
      </div>

      {loading && <LoadingSpinner />}

      {profile && !loading && (
        <>
          <div className="section-label" style={{ marginBottom: 8 }}>Track Specialists</div>
          <CircuitSpecialists specialists={profile.specialists} />

          <div className="section-label" style={{ marginBottom: 8 }}>Manufacturer Affinity</div>
          <ManufacturerAffinity data={profile.manufacturer_affinity} />

          {(profile.weather_sensitivity?.circuit_rain_delta_s != null) && (
            <>
              <div className="section-label" style={{ marginBottom: 8 }}>Weather Sensitivity</div>
              <div className="chart-box" style={{ display: 'flex', gap: 32 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Rain impact here</div>
                  <div style={{ fontSize: 22, fontFamily: 'monospace', fontWeight: 700 }}>
                    +{profile.weather_sensitivity.circuit_rain_delta_s?.toFixed(2)}s
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Series average</div>
                  <div style={{ fontSize: 22, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    +{profile.weather_sensitivity.series_rain_delta_s?.toFixed(2)}s
                  </div>
                </div>
              </div>
            </>
          )}

          {top2.length === 2 && (
            <Link
              to={`/compare?${searchParams}&driver_id=${encodeURIComponent(top2[0].driver_id)},${encodeURIComponent(top2[1].driver_id)}`}
              style={{ display: 'inline-block', marginTop: 8 }}
            >
              <button className="mock-button">Compare top 2 specialists →</button>
            </Link>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Verify circuit profile loads**

```bash
# With backend running:
curl -s "http://localhost:8000/api/circuit/profile?event=Daytona&series=imsa&class=GTP" | python3 -m json.tool | head -20
```

Open http://localhost:5174/circuits/Daytona%20International%20Speedway?series=imsa&class=GTP

- [ ] **Commit**

```bash
git add frontend/src/components/CircuitSpecialists.jsx frontend/src/components/ManufacturerAffinity.jsx frontend/src/pages/CircuitProfile.jsx
git commit -m "feat: CircuitProfile page with specialists, manufacturer affinity, weather sensitivity"
```

---

## Task 18: Contextual navigation — FilterBar circuit link + Drivers nav page

**Files:**
- Modify: `frontend/src/components/FilterBar.jsx`
- Create: `frontend/src/pages/DriversSearch.jsx`

- [ ] **Add circuit link to `FilterBar.jsx`**

When an event is selected, show a small "Circuit →" link next to the event dropdown.

```jsx
import { Link, useSearchParams } from 'react-router-dom'

// Inside FilterBar, after the Event select:
{event && (
  <Link
    to={`/circuits/${encodeURIComponent(event)}?${new URLSearchParams({ series, year, session, class: cls })}`}
    className="circuit-link"
    title="View circuit profile"
  >
    View circuit →
  </Link>
)}
```

Add to `index.css`:
```css
.circuit-link { font-size: 12px; color: var(--accent); text-decoration: none; align-self: flex-end; padding-bottom: 8px; }
.circuit-link:hover { text-decoration: underline; }
```

- [ ] **Create `frontend/src/pages/DriversSearch.jsx`** (the `/drivers` nav destination — a searchable driver list)

```jsx
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFilters } from '../FilterContext'
import FilterBar from '../components/FilterBar'
import { api } from '../api'
import LoadingSpinner from '../components/LoadingSpinner'

export default function DriversSearch() {
  const { series, year, event, session, cls } = useFilters()
  const [searchParams] = useSearchParams()
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!year || !event || !session || !cls) return
    setLoading(true)
    api.drivers(series, year, event, session, cls)
      .then(setDrivers)
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false))
  }, [series, year, event, session, cls])

  const filtered = drivers.filter((d) =>
    d.driver_name.toLowerCase().includes(query.toLowerCase()) ||
    d.team_name?.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="page">
      <FilterBar />
      <input
        className="driver-search-input"
        placeholder="Search driver or team..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <LoadingSpinner />}
      <div className="driver-list">
        {filtered.map((d) => (
          <Link
            key={d.driver_id}
            to={`/drivers/${encodeURIComponent(d.driver_id)}?${searchParams}`}
            className="driver-list-item"
          >
            <span className="driver-list-name">{d.driver_name}</span>
            <span className="driver-list-meta">#{d.car} · {d.team_name}</span>
          </Link>
        ))}
        {!loading && !filtered.length && drivers.length > 0 && (
          <p className="hint">No drivers match "{query}"</p>
        )}
        {!loading && !drivers.length && <p className="hint">Select event and class to browse drivers.</p>}
      </div>
    </div>
  )
}
```

Add styles to `index.css`:
```css
.driver-search-input {
  width: 100%;
  padding: 9px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}
.driver-search-input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.driver-list { display: flex; flex-direction: column; gap: 4px; }
.driver-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  text-decoration: none;
  color: var(--text);
  background: var(--bg-surface);
}
.driver-list-item:hover { border-color: var(--accent); }
.driver-list-name { font-weight: 600; }
.driver-list-meta { font-size: 12px; color: var(--text-muted); }
```

- [ ] **Add `DriversSearch` route to `App.jsx`** — place `/drivers` before `/drivers/:driverId` so the index page matches first; react-router v7 uses specificity not order, but explicit ordering avoids ambiguity

```jsx
import DriversSearch from './pages/DriversSearch'
// In Routes, in this order:
<Route path="/drivers" element={<DriversSearch />} />
<Route path="/drivers/:driverId" element={<DriverProfile />} />
<Route path="/circuits/:event" element={<CircuitProfile />} />
```

- [ ] **Final build check**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error|built"
```

Expected: `✓ built in ...`

- [ ] **Commit**

```bash
git add frontend/src/components/FilterBar.jsx frontend/src/pages/DriversSearch.jsx frontend/src/App.jsx frontend/src/index.css
git commit -m "feat: circuit link in FilterBar, Drivers search page, complete navigation wiring"
```

---

## Task 19: Final push and cleanup

- [ ] **Run all backend tests**

```bash
cd backend && source .venv/bin/activate && pytest tests/ -v
```

All tests must pass.

- [ ] **Smoke test all endpoints**

```bash
curl -s "http://localhost:8000/api/filters?series=imsa" | python3 -m json.tool | grep -c '"'
curl -s "http://localhost:8000/api/compare/h2h?driver_id_a=earl+bamber&driver_id_b=nick+tandy&event=Watkins+Glen&series=imsa&class=GTP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d), 'years')"
curl -s "http://localhost:8000/api/driver/profile?driver_id=earl+bamber&series=imsa&class=GTP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.get('fingerprint',{}).keys()))"
curl -s "http://localhost:8000/api/circuit/profile?event=Daytona&series=imsa&class=GTP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('record:', d.get('record'))"
```

- [ ] **Final commit and push**

```bash
git add -A
git commit -m "feat: IMSA Intel V1 — Compare, Driver Profile, Circuit Profile complete"
git push f1fantasy HEAD
```
