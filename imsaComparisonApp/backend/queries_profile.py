from db import get_conn

_SC = "AND (flags IS NULL OR flags NOT IN ('FCY', 'SF')) AND (pit_time IS NULL OR pit_time = 0)"


def _pct_rank_score(conn, sql: str, params: list) -> float | None:
    row = conn.execute(sql, params).fetchone()
    if row is None or row[0] is None:
        return None
    return round(float(row[0]) * 100, 1)


def driver_fingerprint(driver_id: str, cls: str, series: str) -> dict:
    conn = get_conn()

    # Qualifying pace: PERCENT_RANK where lower lap_time = higher rank
    qual_score = _pct_rank_score(conn, f"""
        WITH medians AS (
            SELECT driver_id, MEDIAN(lap_time) as med
            FROM laps
            WHERE series_code = ? AND class = ? AND session ILIKE '%qual%'
              AND lap_time > 0 {_SC}
            GROUP BY driver_id HAVING COUNT(*) >= 3
        ),
        ranked AS (
            SELECT driver_id, PERCENT_RANK() OVER (ORDER BY med DESC) as pct,
                   COUNT(*) OVER () as pool_size
            FROM medians
        )
        SELECT CASE WHEN pool_size > 1 THEN pct ELSE NULL END
        FROM ranked WHERE driver_id = ?
    """, [series, cls, driver_id])

    # Race pace
    race_score = _pct_rank_score(conn, f"""
        WITH medians AS (
            SELECT driver_id, MEDIAN(lap_time) as med
            FROM laps
            WHERE series_code = ? AND class = ? AND session ILIKE '%race%'
              AND lap_time > 0 {_SC}
            GROUP BY driver_id HAVING COUNT(*) >= 20
        ),
        ranked AS (
            SELECT driver_id, PERCENT_RANK() OVER (ORDER BY med DESC) as pct,
                   COUNT(*) OVER () as pool_size
            FROM medians
        )
        SELECT CASE WHEN pool_size > 1 THEN pct ELSE NULL END
        FROM ranked WHERE driver_id = ?
    """, [series, cls, driver_id])

    # Wet pace (null if driver has <20 wet laps)
    wet_count = conn.execute(
        f"SELECT COUNT(*) FROM laps WHERE series_code=? AND class=? AND driver_id=? AND raining=TRUE AND lap_time>0 {_SC}",
        [series, cls, driver_id]
    ).fetchone()[0]
    if wet_count >= 20:
        wet_score = _pct_rank_score(conn, f"""
            WITH medians AS (
                SELECT driver_id, MEDIAN(lap_time) as med
                FROM laps
                WHERE series_code=? AND class=? AND raining=TRUE AND lap_time>0 {_SC}
                GROUP BY driver_id HAVING COUNT(*) >= 20
            ),
            ranked AS (
                SELECT driver_id, PERCENT_RANK() OVER (ORDER BY med DESC) as pct,
                       COUNT(*) OVER () as pool_size
                FROM medians
            )
            SELECT CASE WHEN pool_size > 1 THEN pct ELSE NULL END
            FROM ranked WHERE driver_id=?
        """, [series, cls, driver_id])
    else:
        wet_score = None

    # Consistency: lower stddev = higher score
    consistency_score = _pct_rank_score(conn, f"""
        WITH stddevs AS (
            SELECT driver_id, STDDEV(lap_time) as sd
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {_SC}
            GROUP BY driver_id HAVING COUNT(*) >= 20
        ),
        ranked AS (
            SELECT driver_id, PERCENT_RANK() OVER (ORDER BY sd ASC) as pct,
                   COUNT(*) OVER () as pool_size
            FROM stddevs
        )
        SELECT CASE WHEN pool_size > 1 THEN pct ELSE NULL END
        FROM ranked WHERE driver_id=?
    """, [series, cls, driver_id])

    # Tire management: pace in late vs early stints, relative to field
    tire_row = conn.execute(f"""
        WITH stint_pace AS (
            SELECT driver_id,
                   AVG(CASE WHEN stint_lap <= 3 THEN lap_time END) as early,
                   AVG(CASE WHEN stint_lap >= 8 THEN lap_time END) as late
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {_SC} AND stint_lap IS NOT NULL
            GROUP BY driver_id HAVING COUNT(*) >= 20
        ),
        deltas AS (
            SELECT driver_id, (late - early) / early as deg_pct
            FROM stint_pace WHERE early IS NOT NULL AND late IS NOT NULL
        ),
        ranked AS (
            SELECT driver_id, PERCENT_RANK() OVER (ORDER BY deg_pct ASC) as pct,
                   COUNT(*) OVER () as pool_size
            FROM deltas
        )
        SELECT CASE WHEN pool_size > 1 THEN pct ELSE NULL END
        FROM ranked WHERE driver_id=?
    """, [series, cls, driver_id]).fetchone()
    tire_score = round(float(tire_row[0]) * 100, 1) if tire_row and tire_row[0] is not None else None

    # Quali→Race delta
    qr_row = conn.execute(f"""
        WITH qual_ranks AS (
            SELECT driver_id,
                   RANK() OVER (ORDER BY MEDIAN(lap_time)) as q_rank
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%qual%' AND lap_time>0 {_SC}
            GROUP BY driver_id HAVING COUNT(*) >= 3
        ),
        race_ranks AS (
            SELECT driver_id,
                   RANK() OVER (ORDER BY MEDIAN(lap_time)) as r_rank
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%' AND lap_time>0 {_SC}
            GROUP BY driver_id HAVING COUNT(*) >= 20
        ),
        deltas AS (
            SELECT q.driver_id, (q.q_rank - r.r_rank) as delta
            FROM qual_ranks q JOIN race_ranks r ON q.driver_id = r.driver_id
        ),
        ranked AS (
            SELECT driver_id, PERCENT_RANK() OVER (ORDER BY delta DESC) as pct,
                   COUNT(*) OVER () as pool_size
            FROM deltas
        )
        SELECT CASE WHEN pool_size > 1 THEN pct ELSE NULL END
        FROM ranked WHERE driver_id=?
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
    rows = get_conn().execute(f"""
        WITH yearly AS (
            SELECT year, driver_id, MEDIAN(lap_time) as med
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {_SC}
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
    rows = get_conn().execute(f"""
        WITH field AS (
            SELECT event, year, MEDIAN(lap_time) as field_med
            FROM laps
            WHERE series_code=? AND class=? AND session ILIKE '%race%' AND lap_time>0 {_SC}
            GROUP BY event, year
        ),
        driver_ev AS (
            SELECT event, year, MEDIAN(lap_time) as drv_med
            FROM laps
            WHERE series_code=? AND class=? AND driver_id=?
              AND session ILIKE '%race%' AND lap_time>0 {_SC}
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


def circuit_specialists(event: str, cls: str, series: str) -> list[dict]:
    rows = get_conn().execute(f"""
        WITH field AS (
            SELECT year, MEDIAN(lap_time) as field_med
            FROM laps
            WHERE series_code=? AND event=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {_SC}
            GROUP BY year
        ),
        driver_ev AS (
            SELECT driver_id, driver_name, year, MEDIAN(lap_time) as drv_med
            FROM laps
            WHERE series_code=? AND event=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {_SC}
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
         "appearances": r[2], "margin_pct": round(float(r[3]), 2)}
        for r in rows
    ]


def circuit_manufacturer_affinity(event: str, cls: str, series: str) -> list[dict]:
    rows = get_conn().execute(f"""
        WITH field_med AS (
            SELECT MEDIAN(lap_time) as med
            FROM laps
            WHERE series_code=? AND event=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {_SC}
        ),
        mfr AS (
            SELECT manufacturer, MEDIAN(lap_time) as med, COUNT(*) as laps
            FROM laps
            WHERE series_code=? AND event=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {_SC} AND manufacturer IS NOT NULL
            GROUP BY manufacturer HAVING COUNT(*) >= 10
        )
        SELECT m.manufacturer,
               (f.med - m.med) / f.med * 100 as delta_pct,
               m.laps
        FROM mfr m, field_med f
        ORDER BY delta_pct DESC
    """, [series, event, cls, series, event, cls]).fetchall()
    return [
        {"manufacturer": r[0], "delta_pct": round(float(r[1]), 2), "laps": r[2]}
        for r in rows
    ]


def circuit_weather_sensitivity(event: str, cls: str, series: str) -> dict:
    conn = get_conn()

    def _rain_delta(event_filter: str | None) -> float | None:
        if event_filter:
            sql = f"""
                SELECT
                    AVG(CASE WHEN raining=TRUE THEN lap_time END) -
                    AVG(CASE WHEN raining=FALSE THEN lap_time END) as delta
                FROM laps
                WHERE series_code=? AND class=? AND session ILIKE '%race%'
                  AND lap_time>0 {_SC} AND event=? AND raining IS NOT NULL
            """
            params = [series, cls, event_filter]
        else:
            sql = f"""
                SELECT
                    AVG(CASE WHEN raining=TRUE THEN lap_time END) -
                    AVG(CASE WHEN raining=FALSE THEN lap_time END) as delta
                FROM laps
                WHERE series_code=? AND class=? AND session ILIKE '%race%'
                  AND lap_time>0 {_SC} AND raining IS NOT NULL
            """
            params = [series, cls]
        row = conn.execute(sql, params).fetchone()
        return float(row[0]) if row and row[0] is not None else None

    return {
        "circuit_rain_delta_s": _rain_delta(event),
        "series_rain_delta_s": _rain_delta(None),
    }


def circuit_record(event: str, cls: str, series: str) -> dict | None:
    row = get_conn().execute(f"""
        SELECT driver_name, year, lap_time, raining
        FROM laps
        WHERE series_code=? AND event=? AND class=? AND lap_time>0 {_SC}
        ORDER BY lap_time ASC LIMIT 1
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


def circuit_field_ranking(event: str, cls: str, series: str) -> list[dict]:
    """Full field ranking at a circuit: vs field median and vs teammates."""
    rows = get_conn().execute(f"""
        WITH field AS (
            SELECT year, MEDIAN(lap_time) as field_med
            FROM laps
            WHERE series_code=? AND event=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {_SC}
            GROUP BY year
        ),
        driver_year AS (
            SELECT driver_id, driver_name, team_name, year,
                   MEDIAN(lap_time) as drv_med,
                   COUNT(*) as laps
            FROM laps
            WHERE series_code=? AND event=? AND class=? AND session ILIKE '%race%'
              AND lap_time>0 {_SC} AND team_name IS NOT NULL
            GROUP BY driver_id, driver_name, team_name, year
            HAVING COUNT(*) >= 3
        ),
        team_year AS (
            -- median of ALL drivers on the team that year (for teammate comparison)
            SELECT team_name, year, MEDIAN(drv_med) as team_med
            FROM driver_year
            GROUP BY team_name, year
        ),
        margins AS (
            SELECT d.driver_id, d.driver_name,
                   -- most recent team for display
                   LAST(d.team_name ORDER BY d.year) as team_name,
                   COUNT(*) as appearances,
                   AVG((f.field_med - d.drv_med) / f.field_med * 100) as vs_field_pct,
                   AVG((t.team_med  - d.drv_med) / t.team_med  * 100) as vs_team_pct
            FROM driver_year d
            JOIN field    f ON d.year = f.year
            JOIN team_year t ON d.team_name = t.team_name AND d.year = t.year
            GROUP BY d.driver_id, d.driver_name
        )
        SELECT driver_id, driver_name, team_name, appearances,
               vs_field_pct, vs_team_pct,
               RANK() OVER (ORDER BY vs_field_pct DESC) as rank
        FROM margins
        ORDER BY vs_field_pct DESC
    """, [series, event, cls, series, event, cls]).fetchall()

    return [
        {
            "rank": int(r[6]),
            "driver_id": r[0],
            "driver_name": r[1],
            "team_name": r[2],
            "appearances": int(r[3]),
            "vs_field_pct": round(float(r[4]), 2),
            "vs_team_pct": round(float(r[5]), 2),
        }
        for r in rows
    ]


def driver_profile(driver_id: str, cls: str, series: str) -> dict:
    conn = get_conn()
    try:
        meta = conn.execute(
            """SELECT driver_name, license, driver_country
               FROM laps WHERE driver_id=? AND series_code=? AND class=? LIMIT 1""",
            [driver_id, series, cls]
        ).fetchone()
        driver_name = meta[0] if meta else None
        license_val = meta[1] if meta else None
        driver_country = meta[2] if meta else None
    except Exception:
        meta_row = conn.execute(
            "SELECT driver_name FROM laps WHERE driver_id=? AND series_code=? AND class=? LIMIT 1",
            [driver_id, series, cls]
        ).fetchone()
        driver_name = meta_row[0] if meta_row else None
        license_val = None
        driver_country = None
    if driver_name is None:
        return {}
    return {
        "driver_id": driver_id,
        "driver_name": driver_name,
        "license": license_val,
        "driver_country": driver_country,
        "fingerprint": driver_fingerprint(driver_id, cls, series),
        "career_arc": driver_career_arc(driver_id, cls, series),
        "best_circuits": driver_best_circuits(driver_id, cls, series),
    }
