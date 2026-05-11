import { createContext, useContext, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from './api'

const FilterContext = createContext(null)

export function FilterProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [seriesList, setSeriesList] = useState([])
  const [universe, setUniverse] = useState(null)
  const [events, setEvents] = useState([])

  const series = searchParams.get('series') || 'imsa'
  const year = searchParams.get('year') ? Number(searchParams.get('year')) : null
  const event = searchParams.get('event') || ''
  const session = searchParams.get('session') || 'race'
  const cls = searchParams.get('class') || ''

  useEffect(() => {
    api.seriesList().then(setSeriesList)
  }, [])

  useEffect(() => {
    setUniverse(null)
    setEvents([])
    api.filters(series).then((data) => {
      setUniverse(data)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (!next.get('year') || !data.years.map(String).includes(next.get('year'))) {
          next.set('year', String(data.years[0]))
          next.delete('event')
          next.delete('class')
        }
        if (!next.get('session')) next.set('session', 'race')
        return next
      }, { replace: true })
    })
  }, [series])

  useEffect(() => {
    if (year && series) api.events(series, year).then(setEvents)
  }, [series, year])

  function setFilter(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set(key, value)
      if (key === 'series') { next.delete('year'); next.delete('event'); next.delete('class') }
      if (key === 'year') { next.delete('event'); next.delete('class') }
      if (key === 'event') next.delete('class')
      return next
    })
  }

  return (
    <FilterContext.Provider value={{ seriesList, universe, events, series, year, event, session, cls, setFilter }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() {
  return useContext(FilterContext)
}
