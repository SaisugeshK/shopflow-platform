import { RefreshCw, TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

/** Friendly fallback for unexpected rendering errors (§66); details stay in the console, not on screen. */
export function RouteError() {
  const error = useRouteError()
  console.error(error)
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="error-state card" style={{ maxWidth: 480 }} role="alert">
        <div className="icon-wrap tone-danger"><TriangleAlert size={26} /></div>
        <h2>{notFound ? 'Page not found' : 'Something went wrong'}</h2>
        <p className="muted small">{notFound ? 'The page you are looking for does not exist.' : 'The page could not be displayed. Reload to try again; your data is safe.'}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => window.location.reload()}><RefreshCw size={16} /> Reload</button>
          <a className="btn btn-secondary" href="/">Go home</a>
        </div>
      </div>
    </div>
  )
}
