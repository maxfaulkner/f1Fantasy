import statistics

from db import get_conn

SAFETY_CAR_FLAGS = ("FCY", "SF")


def _sc_filter() -> str:
    placeholders = ", ".join(f"'{f}'" for f in SAFETY_CAR_FLAGS)
    return f"AND (flags IS NULL OR flags NOT IN ({placeholders})) AND (pit_time IS NULL OR pit_time = 0)"


def get_filter_universe(series: str) -> dict:
    conn = get_conn()
    years = [r[0] for r in conn.execute(
        "SELECT DISTINCT year FROM laps WHERE series_code = ? ORDER BY year DESC", [series]
    ).fetchall()]
    sessions = [r[0] for r in conn.execute(
        "SELECT DISTINCT session FROM laps WHERE series_code = ? ORDER BY session", [series]
    ).fetchall()]
    classes = [r[0] for r in conn.execute(
        "SELECT DISTINCT class FROM laps WHERE series_code = ? ORDER BY class", [series]
    ).fetchall()]
    return {"years": years, "sessions": sessions, "classes": classes}


def get_events(series: str, year: int) -> list[str]:
    rows = get_conn().execute(
        "SELECT DISTINCT event FROM laps WHERE series_code = ? AND year = ? ORDER BY event",
        [series, year],
    ).fetchall()
    return [r[0] for r in rows]


def get_drivers(series: str, year: int, event: str, session: str, cls: str) -> list[dict]:
    rows = get_conn().execute(
        """SELECT DISTINCT driver_id, driver_name, car, team_name
           FROM laps
           WHERE series_code = ? AND year = ? AND event = ? AND session = ? AND class = ?
           ORDER BY driver_name""",
        [series, year, event, session, cls],
    ).fetchall()
    return [{"driver_id": r[0], "driver_name": r[1], "car": r[2], "team_name": r[3]} for r in rows]


def compare_drivers(driver_ids: list[str], series: str, year: int, event: str, session: str, cls: str) -> list[dict]:
    conn = get_conn()
    placeholders = ", ".join("?" * len(driver_ids))
    sc = _sc_filter()

    cutoff_row = conn.execute(
        f"""SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY lap_time)
            FROM laps
            WHERE series_code = ? AND year = ? AND event = ? AND session = ? AND class = ?
              AND lap_time > 0 {sc}""",
        [series, year, event, session, cls],
    ).fetchone()
    cutoff = cutoff_row[0] if cutoff_row else 1e9

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

    by_driver: dict[str, dict] = {}
    for driver_id, driver_name, car, team_name, lap, lap_time, \
            s1, s2, s3, stint, stint_lap, flags in rows:
        if driver_id not in by_driver:
            by_driver[driver_id] = {
                "driver_id": driver_id,
                "driver_name": driver_name,
                "car": car,
                "team_name": team_name,
                "laps": [],
            }
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

    results = []
    for d in by_driver.values():
        times = [float(l["lap_time"]) for l in d["laps"]]
        if times:
            times_sorted = sorted(times)
            p75_idx = int(len(times_sorted) * 0.75)
            d["stats"] = {
                "best_lap": times_sorted[0],
                "median_lap": times_sorted[len(times_sorted) // 2],
                "p75_lap": times_sorted[p75_idx],
                "lap_count": len(times),
                "sigma": round(statistics.stdev(times), 3) if len(times) > 1 else None,
            }
        else:
            d["stats"] = {"best_lap": None, "median_lap": None, "p75_lap": None, "lap_count": 0, "sigma": None}
        results.append(d)

    return results


def get_teams(series: str, year: int, session: str, cls: str) -> list[str]:
    rows = get_conn().execute(
        """SELECT DISTINCT team_name FROM laps
           WHERE series_code = ? AND year = ? AND session = ? AND class = ?
             AND team_name IS NOT NULL
           ORDER BY team_name""",
        [series, year, session, cls],
    ).fetchall()
    return [r[0] for r in rows]


def compare_teams(teams: list[str], series: str, year: int, session: str, cls: str) -> list[dict]:
    conn = get_conn()
    placeholders = ", ".join("?" * len(teams))
    sc = _sc_filter()

    cutoff_row = conn.execute(
        f"""SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY lap_time)
           FROM laps
           WHERE series_code = ? AND year = ? AND session = ? AND class = ?
             AND lap_time > 0 {sc}""",
        [series, year, session, cls],
    ).fetchone()
    cutoff = cutoff_row[0] if cutoff_row else 1e9

    rows = conn.execute(
        f"""SELECT team_name, event, MEDIAN(lap_time) as median_lap, MIN(lap_time) as best_lap, COUNT(*) as lap_count
            FROM laps
            WHERE series_code = ? AND year = ? AND session = ? AND class = ?
              AND team_name IN ({placeholders})
              AND lap_time > 0 AND lap_time < ? {sc}
            GROUP BY team_name, event
            ORDER BY event, team_name""",
        [series, year, session, cls, *teams, cutoff],
    ).fetchall()

    return [
        {"team_name": r[0], "event": r[1], "median_lap": r[2], "best_lap": r[3], "lap_count": r[4]}
        for r in rows
    ]


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
                   CASE WHEN lap_a < lap_b THEN ? WHEN lap_b < lap_a THEN ? ELSE NULL END as winner_id,
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


def get_manufacturers(series: str, year: int, session: str) -> list[str]:
    rows = get_conn().execute(
        """SELECT DISTINCT manufacturer FROM laps
           WHERE series_code = ? AND year = ? AND session = ?
             AND manufacturer IS NOT NULL
           ORDER BY manufacturer""",
        [series, year, session],
    ).fetchall()
    return [r[0] for r in rows]


def compare_manufacturers(manufacturers: list[str], series: str, year: int, session: str, cls_normalized: str) -> list[dict]:
    conn = get_conn()
    placeholders = ", ".join("?" * len(manufacturers))
    sc = _sc_filter()

    cutoff_row = conn.execute(
        f"""SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY lap_time)
           FROM laps
           WHERE series_code = ? AND year = ? AND session = ? AND class_normalized = ?
             AND lap_time > 0 {sc}""",
        [series, year, session, cls_normalized],
    ).fetchone()
    cutoff = cutoff_row[0] if cutoff_row else 1e9

    rows = conn.execute(
        f"""SELECT manufacturer, lap_time
            FROM laps
            WHERE series_code = ? AND year = ? AND session = ? AND class_normalized = ?
              AND manufacturer IN ({placeholders})
              AND lap_time > 0 AND lap_time < ? {sc}
            ORDER BY manufacturer, lap_time""",
        [series, year, session, cls_normalized, *manufacturers, cutoff],
    ).fetchall()

    by_mfr: dict[str, list[float]] = {}
    for mfr, lap_time in rows:
        by_mfr.setdefault(mfr, []).append(lap_time)

    return [{"manufacturer": mfr, "lap_times": times} for mfr, times in by_mfr.items()]
