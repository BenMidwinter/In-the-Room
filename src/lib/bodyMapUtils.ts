export function generateNodePosition(domain) {
  const CENTER_X = 0
  const CENTER_Y = 0

  const RADIUS_INNER = 200
  const RADIUS_MIDDLE = 550
  const RADIUS_OUTER = 900

  let minRadius, maxRadius, minAngle, maxAngle

  if (domain.startsWith('center_')) {
    minRadius = 0
    maxRadius = RADIUS_INNER
  } else if (domain.startsWith('middle_')) {
    minRadius = RADIUS_INNER
    maxRadius = RADIUS_MIDDLE
  } else {
    minRadius = RADIUS_MIDDLE
    maxRadius = RADIUS_OUTER
  }

  const PI_2 = Math.PI * 2
  if (domain === 'middle_affective') { minAngle = 0; maxAngle = PI_2 / 6 }
  else if (domain === 'middle_cognitive') { minAngle = PI_2 / 6; maxAngle = (PI_2 / 6) * 2 }
  else if (domain === 'middle_attentional') { minAngle = (PI_2 / 6) * 2; maxAngle = (PI_2 / 6) * 3 }
  else if (domain === 'middle_self') { minAngle = (PI_2 / 6) * 3; maxAngle = (PI_2 / 6) * 4 }
  else if (domain === 'middle_motivational') { minAngle = (PI_2 / 6) * 4; maxAngle = (PI_2 / 6) * 5 }
  else if (domain === 'middle_behavioral') { minAngle = (PI_2 / 6) * 5; maxAngle = PI_2 }
  else { minAngle = 0; maxAngle = PI_2 }

  const angPad = (maxAngle - minAngle) * 0.1
  const radPad = 40

  const angle = Math.random() * ((maxAngle - angPad) - (minAngle + angPad)) + (minAngle + angPad)
  const radius = Math.sqrt(Math.random() * (Math.pow(maxRadius - radPad, 2) - Math.pow(minRadius + radPad, 2)) + Math.pow(minRadius + radPad, 2))

  return {
    x: CENTER_X + radius * Math.cos(angle),
    y: CENTER_Y + radius * Math.sin(angle),
  }
}
