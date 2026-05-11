async function get(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`)
  return res.json()
}

const qs = (params) =>
  Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')

export const api = {
  seriesList: () => get('/api/filters/series'),
  filters: (series) => get(`/api/filters?series=${series}`),
  events: (series, year) => get(`/api/filters/events?${qs({ series, year })}`),

  drivers: (series, year, event, session, cls) =>
    get(`/api/drivers?${qs({ series, year, event, session, class: cls })}`),

  compareDrivers: (driverIds, series, year, event, session, cls) =>
    get(`/api/compare/drivers?driver_id=${driverIds.join(',')}&${qs({ series, year, event, session, class: cls })}`),

  h2h: (driverIdA, driverIdB, event, series, cls) =>
    get(`/api/compare/h2h?${qs({ driver_id_a: driverIdA, driver_id_b: driverIdB, event, series, class: cls })}`),

  driverProfile: (driverId, series, cls) =>
    get(`/api/driver/profile?${qs({ driver_id: driverId, series, class: cls })}`),

  circuitProfile: (event, series, cls) =>
    get(`/api/circuit/profile?${qs({ event, series, class: cls })}`),

  circuitFieldRanking: (event, series, cls) =>
    get(`/api/circuit/field-ranking?${qs({ event, series, class: cls })}`),
}
