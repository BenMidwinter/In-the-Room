import { useViewport } from '@xyflow/react';

export default function ConcentricBackground() {
  const { x, y, zoom } = useViewport();

  // These must perfectly match the math in your networkUtils.js
  
 const CENTER_X = 0;
  const CENTER_Y = 0;
  const R_INNER = 200;
  const R_MIDDLE = 550;
  const R_OUTER = 900;

  // Calculate the 6 dividing lines for the Process (Middle) Ring
  const sliceAngles = [0, 60, 120, 180, 240, 300].map(deg => deg * (Math.PI / 180));
  
  // Helper to draw text labels on an arc
  const getLabelPos = (radius, angleDeg) => {
    const angleRad = angleDeg * (Math.PI / 180);
    return {
      x: CENTER_X + radius * Math.cos(angleRad),
      y: CENTER_Y + radius * Math.sin(angleRad)
    };
  };

  return (
    // pointerEvents: 'none' is critical so it doesn't block the clinician from dragging nodes
    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        
        {/* OUTER RING: Systemic & Social */}
        <circle cx={CENTER_X} cy={CENTER_Y} r={R_OUTER} fill="#fdfdfd" stroke="#e0e0e0" strokeWidth="2" strokeDasharray="8 4" />
        {/* Adjusted Y position: Added +45 instead of +30 to pull it further down into the circle */}
        <text x={CENTER_X} y={CENTER_Y - R_OUTER + 60} textAnchor="middle" fill="var(--txt-muted)" fontSize="16" fontWeight="bold" fontFamily="var(--font-head)">
    EXTRINSIC / SYSTEMIC CONTEXT
  </text>

        {/* MIDDLE RING: The 6 ACT Processes */}
        <circle cx={CENTER_X} cy={CENTER_Y} r={R_MIDDLE} fill="#f4f6f8" stroke="#d5d8dc" strokeWidth="2" />
        
        {/* Draw the 6 dividing lines for the Hexaflex processes */}
        {sliceAngles.map((angle, i) => (
          <line 
            key={i}
            x1={CENTER_X + R_INNER * Math.cos(angle)} 
            y1={CENTER_Y + R_INNER * Math.sin(angle)} 
            x2={CENTER_X + R_MIDDLE * Math.cos(angle)} 
            y2={CENTER_Y + R_MIDDLE * Math.sin(angle)} 
            stroke="#d5d8dc" strokeWidth="2" strokeDasharray="4 4" 
          />
        ))}

        {/* Labels for the 6 Processes (Positioned in the middle of each 60-degree slice) */}
        { [
            { name: "AFFECTIVE", angle: 30 },
            { name: "COGNITIVE", angle: 90 },
            { name: "ATTENTIONAL", angle: 150 },
            { name: "SELF", angle: 210 },
            { name: "MOTIVATIONAL", angle: 270 },
            { name: "BEHAVIORAL", angle: 330 }
          ].map((slice, i) => {
            const pos = getLabelPos(R_MIDDLE - 60, slice.angle);
            return (
              <text key={i} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle" fill="#95a5a6" fontSize="12" fontWeight="bold" fontFamily="var(--font-body)" opacity="0.7">
                {slice.name}
              </text>
            );
        })}

        {/* INNER CIRCLE: Physiological & Intrinsic */}
        <circle cx={CENTER_X} cy={CENTER_Y} r={R_INNER} fill="#ffffff" stroke="#bdc3c7" strokeWidth="3" />
        <text x={CENTER_X} y={CENTER_Y} textAnchor="middle" dominantBaseline="middle" fill="var(--col-accent)" fontSize="14" fontWeight="bold" fontFamily="var(--font-head)">
          INTRINSIC /
          <tspan x={CENTER_X} dy="1.2em">PHYSIOLOGICAL</tspan>
        </text>
        
      </g>
    </svg>
  );
}