import { BaseEdge, useInternalNode } from '@xyflow/react';

function getIntersectionPoint(node, targetNode) {
  if (!node || !node.measured || !targetNode || !targetNode.measured) return { x: 0, y: 0 };

  const w = node.measured.width;
  const h = node.measured.height;
  const x = (node.internals?.positionAbsolute?.x || node.position.x) + w / 2;
  const y = (node.internals?.positionAbsolute?.y || node.position.y) + h / 2;

  const tw = targetNode.measured.width;
  const th = targetNode.measured.height;
  const tx = (targetNode.internals?.positionAbsolute?.x || targetNode.position.x) + tw / 2;
  const ty = (targetNode.internals?.positionAbsolute?.y || targetNode.position.y) + th / 2;

  const dx = tx - x;
  const dy = ty - y;

  if (dx === 0 && dy === 0) return { x, y };

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let xInt, yInt;

  if (absDx * h > absDy * w) {
    xInt = x + (dx > 0 ? w / 2 : -w / 2);
    yInt = y + dy * (w / 2 / absDx);
  } else {
    yInt = y + (dy > 0 ? h / 2 : -h / 2);
    xInt = x + dx * (h / 2 / absDy);
  }

  return { x: xInt, y: yInt };
}

export default function ImpactEdge({
  id, source, target, data, markerEnd
}) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode || !sourceNode.measured || !targetNode.measured) return null;

  const sourcePoint = getIntersectionPoint(sourceNode, targetNode);
  const targetPoint = getIntersectionPoint(targetNode, sourceNode);

  const dx = targetPoint.x - sourcePoint.x;
  const dy = targetPoint.y - sourcePoint.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  const tension = Math.max(25, dist * 0.2);

  const hash = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const laneMulti = 0.5 + (hash % 3) * 0.5; 

  const midX = sourcePoint.x + dx / 2;
  const midY = sourcePoint.y + dy / 2;

  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);

  const cx = midX + nx * (tension * laneMulti);
  const cy = midY + ny * (tension * laneMulti);

  const edgePath = `M ${sourcePoint.x},${sourcePoint.y} Q ${cx},${cy} ${targetPoint.x},${targetPoint.y}`;

  const isPositive = data?.relationship_type === 'positive';
  const color = isPositive ? '#22c55e' : '#ef4444';
  const strokeWidth = (data?.weight || 1) * 1.5 + 1;

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      // THE FIX: We use the natively generated SVG string passed by React Flow
      markerEnd={markerEnd}
      interactionWidth={40}
      style={{ stroke: color, strokeWidth: strokeWidth, opacity: 0.85, cursor: 'pointer' }}
    />
  );
}