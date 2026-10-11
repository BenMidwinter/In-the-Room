import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** True when this screen was opened from another screen in the app. */
export function hasAppHistory(locationKey) {
  return Boolean(locationKey) && locationKey !== 'default'
}

/** Return to the previous screen, or the fallback when this tab was opened here. */
export function useGoBack(fallback) {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => {
    if (hasAppHistory(location.key)) {
      navigate(-1)
      return
    }
    if (typeof fallback === 'function') fallback()
    else navigate(fallback)
  }, [navigate, location.key, fallback])
}
