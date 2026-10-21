import { useEffect, useState } from 'react'

const PHONE_QUERY = '(max-width: 639px)'

export function usePhoneLayout() {
  const [phone, setPhone] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches
  ))

  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY)
    const apply = () => setPhone(media.matches)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  return phone
}
