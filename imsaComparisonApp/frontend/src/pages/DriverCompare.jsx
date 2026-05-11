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
  const all = results.flatMap((d) => d.laps.map((l) => Number(l.lap_time))).sort((a, b) => a - b)
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
