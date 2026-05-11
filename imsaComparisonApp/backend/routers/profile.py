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


@router.get("/circuit/field-ranking")
def get_circuit_field_ranking(
    event: str,
    series: str = "imsa",
    cls: str = Query(alias="class"),
) -> list[dict]:
    return queries_profile.circuit_field_ranking(event, cls, series)
