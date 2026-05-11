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
    # Driver A (bamber): GTP race at Watkins Glen, 2022, 2023, and 2024
    for year in ["2022", "2023", "2024"]:
        for lap in range(1, 56):
            rows.append(("imsa", year, "Watkins Glen", "race", "10", "GTP", "GTP",
                         "Earl Bamber", "earl bamber", lap,
                         100.0 + lap * 0.1,  # lap_time
                         32.0, 44.0, 24.0,   # sectors
                         "GF", 1, lap, "Porsche", "Porsche", False, 72.0, 85.0))
    # Driver B (tandy): same event
    for year in ["2023", "2024"]:
        for lap in range(1, 56):
            rows.append(("imsa", year, "Watkins Glen", "race", "79", "GTP", "GTP",
                         "Nick Tandy", "nick tandy", lap,
                         100.5 + lap * 0.1,
                         32.3, 44.2, 24.0,
                         "GF", 1, lap, "Porsche", "Porsche", False, 72.0, 85.0))
    # Driver A qualifying laps
    for year in ["2022", "2023", "2024"]:
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
    # Dry laps at Sebring (for weather sensitivity test)
    for lap in range(1, 21):
        rows.append(("imsa", "2023", "Sebring", "race", "10", "GTP", "GTP",
                     "Earl Bamber", "earl bamber", lap, 105.0 + lap * 0.15,
                     None, None, None,
                     "GF", 1, lap, "Porsche", "Porsche", False, 72.0, 90.0))
    conn.executemany("INSERT INTO laps VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    return conn
