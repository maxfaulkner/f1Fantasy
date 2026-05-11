from fastapi import APIRouter
import queries

router = APIRouter(prefix="/api/filters")

SERIES = {
    "imsa": "IMSA WeatherTech",
    "impc": "Michelin Pilot Challenge",
    "wec": "WEC",
    "elms": "ELMS",
    "alms": "ALMS",
}

_universe_cache: dict[str, dict] = {}


@router.get("/series")
def get_series() -> list[dict]:
    return [{"code": code, "label": label} for code, label in SERIES.items()]


@router.get("")
def get_filters(series: str = "imsa") -> dict:
    if series not in _universe_cache:
        _universe_cache[series] = queries.get_filter_universe(series)
    return _universe_cache[series]


@router.get("/events")
def get_events(series: str = "imsa", year: int = 0) -> list[str]:
    return queries.get_events(series, year)
