import { shouldBlurClientIdentity } from '../lib/demoPersonas'

/** Renders text with a privacy blur when Service Lead view is active. */
export default function BlurredName({ name, blur, className = '', as: Tag = 'span', ...rest }) {
  if (!blur) {
    return <Tag className={className} {...rest}>{name}</Tag>
  }

  return (
    <Tag
      className={`identity-blur ${className}`.trim()}
      aria-label="Name hidden in Service Lead view"
      title="Name hidden in Service Lead view"
      {...rest}
    >
      {name}
    </Tag>
  )
}

export function useClientNameBlur(activePersona) {
  return shouldBlurClientIdentity(activePersona)
}
