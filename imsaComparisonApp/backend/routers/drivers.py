from fastapi import APIRouter, Query
import queries

router = APIRouter(prefix="/api")


@router.get("/drivers")
def get_drivers(
    series: str = "imsa",
    year: int = 0,
    event: str = "",
    session: str = "race",
    cls: str = Query(alias="class"),
) -> list[dict]:
    return queries.get_drivers(series, year, event, session, cls)


@router.get("/compare/drivers")
def compare_drivers(
    driver_id: str,
    series: str = "imsa",
    year: int = 0,
    event: str = "",
    session: str = "race",
    cls: str = Query(alias="class"),
) -> list[dict]:
    ids = [d.strip() for d in driver_id.split(",") if d.strip()]
    return queries.compare_drivers(ids, series, year, event, session, cls)


@router.get("/compare/h2h")
def h2h(
    driver_id_a: str,
    driver_id_b: str,
    event: str,
    series: str = "imsa",
    cls: str = Query(alias="class"),
) -> list[dict]:
    return queries.h2h_record(driver_id_a, driver_id_b, event, cls, series)
