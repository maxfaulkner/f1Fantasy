import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import queries
import queries_profile  # will be needed in Task 4

from unittest.mock import patch
import pytest


def test_fixture_has_data(db):
    count = db.execute("SELECT COUNT(*) FROM laps").fetchone()[0]
    assert count > 0

def test_fixture_has_both_drivers(db):
    drivers = {r[0] for r in db.execute("SELECT DISTINCT driver_id FROM laps").fetchall()}
    assert "earl bamber" in drivers
    assert "nick tandy" in drivers

def test_compare_drivers_includes_sectors_and_stintlap(db):
    with patch("queries.get_conn", return_value=db):
        results = queries.compare_drivers(
            ["earl bamber"], "imsa", "2023", "Watkins Glen", "race", "GTP"
        )
    assert len(results) == 1
    laps = results[0]["laps"]
    assert len(laps) > 0
    assert "lap_time_s1" in laps[0]
    assert "stint_lap" in laps[0]
    assert laps[0]["lap_time_s1"] == pytest.approx(32.0)
    assert laps[0]["stint_lap"] == 1

def test_compare_drivers_stats_includes_sigma(db):
    with patch("queries.get_conn", return_value=db):
        results = queries.compare_drivers(
            ["earl bamber", "nick tandy"], "imsa", "2023", "Watkins Glen", "race", "GTP"
        )
    for driver in results:
        assert "sigma" in driver["stats"]
        assert driver["stats"]["sigma"] >= 0
    bamber = next(d for d in results if d["driver_id"] == "earl bamber")
    assert bamber["stats"]["sigma"] is not None
    assert bamber["stats"]["sigma"] > 0


def test_driver_fingerprint_returns_six_dimensions(db):
    with patch("queries_profile.get_conn", return_value=db):
        result = queries_profile.driver_fingerprint("earl bamber", "GTP", "imsa")
    dims = {"qualifying_pace", "race_pace", "wet_pace", "consistency",
            "tire_management", "quali_race_delta"}
    assert set(result.keys()) == dims
    for k, v in result.items():
        assert v is None or 0 <= v <= 100, f"{k}={v} out of range"

def test_driver_career_arc(db):
    with patch("queries_profile.get_conn", return_value=db):
        result = queries_profile.driver_career_arc("earl bamber", "GTP", "imsa")
    assert len(result) >= 1
    for row in result:
        assert "year" in row and "percentile" in row
        assert 0 <= row["percentile"] <= 100

def test_driver_best_circuits(db):
    with patch("queries_profile.get_conn", return_value=db):
        result = queries_profile.driver_best_circuits("earl bamber", "GTP", "imsa")
    assert isinstance(result, list)
    events = [r["event"] for r in result]
    assert "Watkins Glen" in events

def test_driver_profile_composite(db):
    with patch("queries_profile.get_conn", return_value=db):
        result = queries_profile.driver_profile("earl bamber", "GTP", "imsa")
    assert result["driver_id"] == "earl bamber"
    assert result["driver_name"] == "Earl Bamber"
    assert "fingerprint" in result
    assert "career_arc" in result
    assert "best_circuits" in result
    assert isinstance(result["fingerprint"], dict)
    assert len(result["career_arc"]) >= 1

def test_circuit_specialists(db):
    with patch("queries_profile.get_conn", return_value=db):
        result = queries_profile.circuit_specialists("Watkins Glen", "GTP", "imsa")
    assert isinstance(result, list)
    assert len(result) >= 1
    for row in result:
        assert "driver_id" in row and "margin_pct" in row and "appearances" in row

def test_circuit_manufacturer_affinity(db):
    with patch("queries_profile.get_conn", return_value=db):
        result = queries_profile.circuit_manufacturer_affinity("Watkins Glen", "GTP", "imsa")
    assert isinstance(result, list)
    assert any(r["manufacturer"] == "Porsche" for r in result)

def test_circuit_record(db):
    with patch("queries_profile.get_conn", return_value=db):
        result = queries_profile.circuit_record("Watkins Glen", "GTP", "imsa")
    assert result is not None
    assert "driver_name" in result and "year" in result
    assert "lap_time" in result and "wet" in result
    assert result["lap_time"] > 0
    assert result["wet"] is False  # fixture uses raining=False for Watkins Glen

def test_circuit_weather_sensitivity(db):
    with patch("queries_profile.get_conn", return_value=db):
        result = queries_profile.circuit_weather_sensitivity("Sebring", "GTP", "imsa")
    assert "circuit_rain_delta_s" in result
    assert "series_rain_delta_s" in result
    assert result["circuit_rain_delta_s"] is not None  # both wet and dry laps exist now


def test_h2h_record_returns_year_by_year(db):
    with patch("queries.get_conn", return_value=db):
        result = queries.h2h_record(
            "earl bamber", "nick tandy", "Watkins Glen", "GTP", "imsa"
        )
    # fixture has tandy for 2023 and 2024 only; JOIN yields 2 paired years
    assert len(result) == 2
    years = {r["year"] for r in result}
    assert {"2023", "2024"} == years
    for row in result:
        assert "winner_id" in row
        assert "margin" in row
        assert row["winner_id"] == "earl bamber"  # bamber is faster in fixture
        assert row["margin"] == pytest.approx(0.5, abs=1e-2)
