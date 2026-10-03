import { Handle, Position } from '@xyflow/react';

const domainColors = {
  'center_physiological': '#e74c3c',
  'middle_affective': '#9b59b6',
  'middle_cognitive': '#3498db',
  'middle_attentional': '#f1c40f',
  'middle_self': '#1abc9c',
  'middle_motivational': '#e67e22',
  'middle_behavioral': '#2ecc71',
  'outer_systemic': '#34495e',
};

// Helper to create overlapping omnidirectional handles on a specific side
const OmniHandle = ({ position, isLineMode, idSuffix }) => (
  <>
    <Handle 
      type="target" 
      position={position} 
      id={`target-${idSuffix}`}
      style={{ 
        width: '16px', height: '16px', background: '#3498db', border: '2px solid white',
        opacity: isLineMode ? 1 : 0, pointerEvents: isLineMode ? 'auto' : 'none', zIndex: 10 
      }} 
    />
    <Handle 
      type="source" 
      position={position} 
      id={`source-${idSuffix}`}
      style={{ 
        width: '16px', height: '16px', background: '#3498db', border: '2px solid white',
        opacity: isLineMode ? 1 : 0, pointerEvents: isLineMode ? 'auto' : 'none', zIndex: 10 
      }} 
    />
  </>
);

export default function ClinicalNode({ data }) {
  const color = domainColors[data.domain] || '#95a5a6';
  const isExpanded = data.isExpanded; 
  const isLineMode = data.isLineMode; 

  return (
    <div style={{
      background: 'white',
      borderTop: `6px solid ${color}`,
      borderLeft: data.is_intervention ? `4px solid #f1c40f` : '1px solid #ddd',
      borderRight: '1px solid #ddd',
      borderBottom: '1px solid #ddd',
      borderRadius: '6px',
      padding: '12px',
      width: isExpanded ? '240px' : '150px',
      boxShadow: data.is_intervention ? `0 0 15px rgba(241, 196, 15, 0.4)` : '0 4px 6px rgba(0,0,0,0.05)',
      transition: 'width 0.2s ease, box-shadow 0.2s ease',
      cursor: isLineMode ? 'crosshair' : 'pointer',
    }}>
      
      {/* 4 Explicit Connection Zones */}
      <OmniHandle position={Position.Top} isLineMode={isLineMode} idSuffix="top" />
      <OmniHandle position={Position.Right} isLineMode={isLineMode} idSuffix="right" />
      <OmniHandle position={Position.Bottom} isLineMode={isLineMode} idSuffix="bottom" />
      <OmniHandle position={Position.Left} isLineMode={isLineMode} idSuffix="left" />
      
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        {data.is_intervention && <span style={{ color: '#f1c40f', fontSize: '1.2rem', lineHeight: '1rem' }}>★</span>}
        <strong style={{ fontSize: '0.9rem', color: 'var(--col-accent)', lineHeight: '1.2' }}>
          {data.label || 'Unnamed Node'}
        </strong>
      </div>

      {isExpanded && data.description && (
        <div style={{ 
          marginTop: '10px', fontSize: '0.8rem', color: 'var(--txt-muted)', 
          borderTop: '1px solid #eee', paddingTop: '8px', fontFamily: 'var(--font-body)'
        }}>
          {data.description}
        </div>
      )}
    </div>
  );
}