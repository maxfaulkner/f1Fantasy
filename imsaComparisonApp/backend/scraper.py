"""
Scrape IMSA Michelin Pilot Challenge lap data into data/impc.duckdb.
Usage: python scraper.py [--from-year YYYY]
"""

import argparse
import csv
import io
import re
import sys
import time
import urllib.request
from pathlib import Path

import duckdb

BASE_URL = "https://imsa.results.alkamelcloud.com/Results/"
IMPC_SERIES = "IMSA Michelin Pilot Challenge"
DB_PATH = Path(__file__).parent.parent / "data" / "impc.duckdb"
REQUEST_DELAY = 0.4

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS laps (
    series_code             VARCHAR,
    series                  VARCHAR,
    start_date              TIMESTAMP,
    year                    VARCHAR,
    event                   VARCHAR,
    session                 VARCHAR,
    session_id              BIGINT,
    session_time            DECIMAL(10,3),
    clock_time              DECIMAL(10,3),
    session_time_lap_number INTEGER,
    car                     VARCHAR,
    class                   VARCHAR,
    driver_name             VARCHAR,
    driver_id               VARCHAR,
    lap                     INTEGER,
    lap_time                DECIMAL(10,3),
    lap_time_s1             DECIMAL(10,3),
    lap_time_s2             DECIMAL(10,3),
    lap_time_s3             DECIMAL(10,3),
    lap_time_driver_rank    BIGINT,
    lap_time_driver_quartile BIGINT,
    bpillar_quartile        INTEGER,
    pit_time                DECIMAL(10,3),
    flags                   VARCHAR,
    stint_start             INTEGER,
    stint_number            HUGEINT,
    stint_lap               INTEGER,
    license                 VARCHAR,
    license_rank            INTEGER,
    driver_country          VARCHAR,
    team_name               VARCHAR,
    chassis                 VARCHAR,
    homologation            VARCHAR,
    manufacturer            VARCHAR,
    air_temp_f              DECIMAL(6,2),
    track_temp_f            DECIMAL(6,2),
    humidity_percent        DECIMAL(6,2),
    pressure_inhg           DECIMAL(6,2),
    wind_speed_mph          DECIMAL(6,2),
    wind_direction_degrees  INTEGER,
    raining                 BOOLEAN,
    est_tire_age            INTEGER,
    class_normalized        VARCHAR,
    class_category          VARCHAR,
)
"""


def fetch(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; personal research tool)"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def list_dirs(url: str) -> list[str]:
    """Return relative subdirectory hrefs from an Apache directory listing."""
    html = fetch(url).decode("utf-8", errors="replace")
    hrefs = re.findall(r'href="([^"]+/)"', html)
    # Keep only simple relative paths (not query params, absolute paths, or parent links)
    return [h for h in hrefs if h and not h.startswith("/") and not h.startswith("?") and not h.startswith("..")]


def list_files(url: str, prefix: str) -> list[str]:
    """Return relative file hrefs from a directory listing with the given prefix."""
    html = fetch(url).decode("utf-8", errors="replace")
    hrefs = re.findall(r'href="([^"]+)"', html)
    return [h for h in hrefs if not h.startswith("/") and not h.startswith("?") and h.startswith(prefix)]


def parse_csv(raw: bytes) -> list[dict]:
    """Parse a semicolon-delimited Al Kamel CSV, stripping whitespace from all keys/values."""
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text), delimiter=";")
    headers = [h.strip() for h in next(reader, [])]
    return [{k: v.strip() for k, v in zip(headers, row)} for row in reader if any(v.strip() for v in row)]


def to_seconds(s: str) -> float | None:
    s = s.strip()
    if not s:
        return None
    try:
        parts = s.split(":")
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    except ValueError:
        pass
    return None


def normalize_session(raw: str) -> str:
    s = re.sub(r"^free practice", "practice", raw.lower().strip())
    return s


def session_name_from_folder(folder: str) -> str:
    """Strip URL encoding and leading timestamp/index prefix from a session folder name."""
    decoded = urllib.request.unquote(folder.rstrip("/"))
    # Strip leading 12-digit timestamp prefix (YYYYMMDDHHSS_) or shorter numeric index (NN_)
    cleaned = re.sub(r"^\d+_", "", decoded)
    return normalize_session(cleaned)


def event_name_from_folder(folder: str) -> str:
    decoded = urllib.request.unquote(folder.rstrip("/"))
    return re.sub(r"^\d+_", "", decoded)


def find_lap_csv(session_url: str) -> tuple[str, str] | None:
    """Return (base_url, filename) for the 23_Time Cards CSV.
    Checks top level first, then the highest-numbered subfolder (race final-hour pattern)."""
    try:
        files = list_files(session_url, "23_")
        csv_file = next((f for f in files if f.upper().endswith(".CSV")), None)
        if csv_file:
            return session_url, csv_file
    except Exception:
        return None

    try:
        subdirs = list_dirs(session_url)
        numbered = sorted([s for s in subdirs if re.match(r"\d+_", s)], reverse=True)
        for subdir in numbered:
            time.sleep(REQUEST_DELAY)
            sub_url = session_url + subdir
            files = list_files(sub_url, "23_")
            csv_file = next((f for f in files if f.upper().endswith(".CSV")), None)
            if csv_file:
                return sub_url, csv_file
    except Exception:
        pass

    return None


def scrape_session(session_url: str) -> list[tuple]:
    """Return list of row tuples from the 23_Time Cards CSV, or [] if unavailable."""
    result = find_lap_csv(session_url)
    if not result:
        return []
    csv_base_url, csv_file = result

    time.sleep(REQUEST_DELAY)
    try:
        rows = parse_csv(fetch(csv_base_url + csv_file))
    except Exception as e:
        print(f"CSV error: {e}")
        return []

    by_car: dict[str, list[dict]] = {}
    for row in rows:
        car = row.get("NUMBER", "")
        if car:
            by_car.setdefault(car, []).append(row)

    records: list[tuple] = []
    for car, car_rows in by_car.items():
        try:
            car_rows.sort(key=lambda r: int(r.get("LAP_NUMBER", 0) or 0))
        except ValueError:
            pass

        stint, stint_lap, next_is_start = 1, 0, False
        for row in car_rows:
            lap_num_str = row.get("LAP_NUMBER", "")
            if not lap_num_str or not lap_num_str.isdigit():
                continue
            lap_time = to_seconds(row.get("LAP_TIME", ""))
            if lap_time is None:
                continue

            is_stint_start = 1 if next_is_start else 0
            stint_lap += 1
            next_is_start = bool(row.get("CROSSING_FINISH_LINE_IN_PIT", "").strip())

            driver_raw = row.get("DRIVER_NAME", "").strip()
            cls = row.get("CLASS", "").strip()

            records.append((
                None, None, None, None, None, None, None,  # filled by caller (series_code…session_id)
                to_seconds(row.get("ELAPSED", "")),   # session_time
                to_seconds(row.get("ELAPSED", "")),   # clock_time
                int(lap_num_str),
                car,
                cls,
                driver_raw,
                re.sub(r"\s+", " ", driver_raw).lower(),
                int(lap_num_str),
                lap_time,
                to_seconds(row.get("S1", "")),
                to_seconds(row.get("S2", "")),
                to_seconds(row.get("S3", "")),
                None, None, None,
                to_seconds(row.get("PIT_TIME", "")),
                row.get("FLAG_AT_FL", "").strip() or None,
                is_stint_start,
                stint,
                stint_lap,
                None, None, None,
                row.get("TEAM", "").strip() or None,
                None, None,
                row.get("MANUFACTURER", "").strip() or None,
                None, None, None, None, None, None,
                None, None,
                cls,
                None,
            ))

            if next_is_start:
                stint += 1
                stint_lap = 0

    return records


def already_scraped(conn: duckdb.DuckDBPyConnection, year: str, event: str, session: str) -> bool:
    r = conn.execute(
        "SELECT COUNT(*) FROM laps WHERE year = ? AND event = ? AND session = ?",
        [year, event, session],
    ).fetchone()
    return bool(r and r[0] > 0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-year", type=int, default=2020)
    args = parser.parse_args()

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(DB_PATH))
    conn.execute(CREATE_TABLE)
    session_id = int(conn.execute("SELECT COALESCE(MAX(session_id), 0) FROM laps").fetchone()[0])

    print(f"Fetching year index from {BASE_URL}")
    year_folders = list_dirs(BASE_URL)
    year_folders = [f for f in year_folders if re.match(r"\d{2}_\d{4}/", f)]
    year_folders = [f for f in year_folders if int(f.split("_")[1].rstrip("/")) >= args.from_year]

    for year_folder in sorted(year_folders):
        year = year_folder.split("_")[1].rstrip("/")
        year_url = BASE_URL + year_folder
        print(f"\n=== {year} ===")

        time.sleep(REQUEST_DELAY)
        try:
            event_folders = list_dirs(year_url)
        except Exception as e:
            print(f"  Failed: {e}")
            continue

        for event_folder in sorted(event_folders):
            event_url = year_url + event_folder
            time.sleep(REQUEST_DELAY)
            try:
                series_folders = list_dirs(event_url)
            except Exception:
                continue

            impc_folder = next(
                (f for f in series_folders if IMPC_SERIES in urllib.request.unquote(f)),
                None,
            )
            if not impc_folder:
                continue

            event_name = event_name_from_folder(event_folder)
            print(f"  {event_name}")

            impc_url = event_url + impc_folder
            time.sleep(REQUEST_DELAY)
            try:
                session_folders = list_dirs(impc_url)
            except Exception:
                continue

            for sf in sorted(session_folders):
                sname = session_name_from_folder(sf)
                if already_scraped(conn, year, event_name, sname):
                    print(f"    {sname} — already scraped")
                    continue

                print(f"    {sname} — scraping...", end=" ", flush=True)
                session_url = impc_url + sf
                time.sleep(REQUEST_DELAY)

                raw_records = scrape_session(session_url)
                if not raw_records:
                    print("no lap data")
                    continue

                session_id += 1
                full_records = []
                for rec in raw_records:
                    rec = list(rec)
                    rec[0] = "impc"
                    rec[1] = f"impc-{year}"
                    rec[2] = None
                    rec[3] = year
                    rec[4] = event_name
                    rec[5] = sname
                    rec[6] = session_id
                    full_records.append(tuple(rec))

                conn.executemany(
                    f"INSERT INTO laps VALUES ({', '.join(['?'] * 44)})",
                    full_records,
                )
                conn.commit()
                print(f"{len(full_records)} laps")

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
