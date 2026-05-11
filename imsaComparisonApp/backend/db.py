import urllib.request
import shutil
from pathlib import Path

import duckdb

HF_URL = "https://huggingface.co/datasets/tobil/imsa/resolve/main/imsa.duckdb"
IMSA_DB_PATH = Path(__file__).parent.parent / "data" / "imsa.duckdb"
IMPC_DB_PATH = Path(__file__).parent.parent / "data" / "impc.duckdb"
EXPECTED_MIN_SIZE = 100_000_000

_conn: duckdb.DuckDBPyConnection | None = None


def ensure_db() -> None:
    if IMSA_DB_PATH.exists() and IMSA_DB_PATH.stat().st_size > EXPECTED_MIN_SIZE:
        return

    print(f"Downloading IMSA dataset (~128 MB) to {IMSA_DB_PATH} ...")
    IMSA_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = IMSA_DB_PATH.with_suffix(".tmp")

    with urllib.request.urlopen(HF_URL) as response, open(tmp, "wb") as out:
        shutil.copyfileobj(response, out)

    tmp.rename(IMSA_DB_PATH)
    print("Download complete.")


def get_conn() -> duckdb.DuckDBPyConnection:
    global _conn
    if _conn is None:
        _conn = duckdb.connect(":memory:")
        _conn.execute(f"ATTACH '{IMSA_DB_PATH}' AS imsa (READ_ONLY)")
        if IMPC_DB_PATH.exists():
            _conn.execute(f"ATTACH '{IMPC_DB_PATH}' AS impc (READ_ONLY)")
            _conn.execute(
                "CREATE VIEW laps AS SELECT * FROM imsa.laps UNION ALL SELECT * FROM impc.laps"
            )
            print(f"Loaded IMPC data from {IMPC_DB_PATH}")
        else:
            _conn.execute("CREATE VIEW laps AS SELECT * FROM imsa.laps")
    return _conn
