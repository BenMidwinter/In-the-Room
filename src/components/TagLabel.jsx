import { tagColour } from '../lib/supabase/screenerRepo'

function labelInk(color) {
  const hex = tagColour(color).slice(1)
  const red = parseInt(hex.slice(0, 2), 16)
  const green = parseInt(hex.slice(2, 4), 16)
  const blue = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.64 ? '#241f1a' : '#fffdf8'
}

export default function TagLabel({ name, color }) {
  const background = tagColour(color)
  return (
    <span className="tag-label" style={{ background, color: labelInk(background) }}>
      {name}
    </span>
  )
}
