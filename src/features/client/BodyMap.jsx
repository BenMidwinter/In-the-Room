import { useState, useCallback, useEffect } from 'react'
import {
  ReactFlow, Controls, applyNodeChanges, applyEdgeChanges,
  addEdge, ReactFlowProvider, MarkerType, ConnectionMode
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'

import ClinicalNode from '../../components/ClinicalNode'
import ImpactEdge from '../../components/ImpactEdge'
import ConcentricBackground from '../../components/ConcentricBackground'
import { generateNodePosition } from '../../lib/bodyMapUtils'
import { getBodyMap, saveBodyMap } from '../../lib/store'
import { useToast } from '../../components/ui'

const nodeTypes = { clinical: ClinicalNode }
const edgeTypes = { impact: ImpactEdge }

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function defaultMap() {
  const n1 = generateUUID()
  const n2 = generateUUID()
  return {
    nodes: [
      { id: n1, type: 'clinical', position: generateNodePosition('middle_cognitive'), data: { label: 'New concept', description: '', domain: 'middle_cognitive', is_intervention: false, isExpanded: false } },
      { id: n2, type: 'clinical', position: generateNodePosition('center_physiological'), data: { label: 'Body signal', description: '', domain: 'center_physiological', is_intervention: false, isExpanded: false } },
    ],
    edges: [
      { id: generateUUID(), source: n1, target: n2, type: 'impact', markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' }, data: { relationship_type: 'negative', weight: 2 } },
    ],
  }
}

export default function BodyMap({ client, onClose }) {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [selectedElement, setSelectedElement] = useState(null)
  const [isLegendOpen, setIsLegendOpen] = useState(false)
  const [mode, setMode] = useState('view')
  const [rfInstance, setRfInstance] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const saved = getBodyMap(client.id)
    if (saved?.nodes?.length) {
      setNodes(saved.nodes)
      setEdges(saved.edges || [])
    } else {
      const defaults = defaultMap()
      setNodes(defaults.nodes)
      setEdges(defaults.edges)
    }
  }, [client.id])

  const handleSaveSnapshot = () => {
    setIsSaving(true)
    try {
      saveBodyMap(client.id, { nodes, edges })
      toast.success('Body map saved.')
    } catch (error) {
      toast.error('Save failed: ' + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const updateFocus = useCallback((activeNodeId, currentEdges) => {
    const expandedIds = new Set()
    if (activeNodeId) {
      expandedIds.add(activeNodeId)
      currentEdges.forEach(e => {
        if (e.source === activeNodeId) expandedIds.add(e.target)
        if (e.target === activeNodeId) expandedIds.add(e.source)
      })
    }
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, isExpanded: expandedIds.has(n.id) } })))
  }, [])

  const onNodesChange = useCallback((changes) => setNodes(nds => applyNodeChanges(changes, nds)), [])
  const onEdgesChange = useCallback((changes) => setEdges(eds => applyEdgeChanges(changes, eds)), [])

  const onConnect = useCallback((params) => {
    const newEdge = {
      ...params, id: generateUUID(), type: 'impact',
      data: { relationship_type: 'positive', weight: 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' },
    }
    setEdges(eds => {
      const updated = addEdge(newEdge, eds)
      if (selectedElement?.type === 'node') updateFocus(selectedElement.id, updated)
      return updated
    })
    setSelectedElement(newEdge)
    setIsSidebarOpen(true)
  }, [selectedElement, updateFocus])

  const onNodeClick = useCallback((event, node) => {
    updateFocus(node.id, edges)
    if (mode === 'nodes') {
      setSelectedElement(node)
      setIsSidebarOpen(true)
    } else {
      setIsSidebarOpen(false)
    }
  }, [mode, edges, updateFocus])

  const onEdgeClick = useCallback((event, edge) => {
    if (mode === 'lines') {
      setSelectedElement(edge)
      updateFocus(null, edges)
      setIsSidebarOpen(true)
    }
  }, [mode, edges, updateFocus])

  const assignDomain = (x, y) => {
    const radius = Math.sqrt(x * x + y * y)
    let angle = (Math.atan2(y, x) * 180) / Math.PI
    if (angle < 0) angle += 360

    let newDomain = 'center_physiological'
    if (radius > 200 && radius < 550) {
      if (angle < 60) newDomain = 'middle_affective'
      else if (angle < 120) newDomain = 'middle_cognitive'
      else if (angle < 180) newDomain = 'middle_attentional'
      else if (angle < 240) newDomain = 'middle_self'
      else if (angle < 300) newDomain = 'middle_motivational'
      else newDomain = 'middle_behavioral'
    } else if (radius >= 550) {
      newDomain = 'outer_systemic'
    }
    return newDomain
  }

  const onPaneClick = useCallback((event) => {
    if (mode === 'nodes' && rfInstance) {
      const position = rfInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const newNode = {
        id: generateUUID(), type: 'clinical', position,
        data: { label: 'New concept', description: '', domain: assignDomain(position.x, position.y), is_intervention: false, isExpanded: true },
      }
      setNodes(nds => [...nds, newNode])
      setSelectedElement(newNode)
      setIsSidebarOpen(true)
    } else {
      setIsSidebarOpen(false)
      setSelectedElement(null)
      updateFocus(null, edges)
    }
  }, [mode, rfInstance, edges, updateFocus])

  const onNodeDragStop = useCallback((event, node) => {
    const newDomain = assignDomain(node.position.x, node.position.y)
    setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, domain: newDomain } } : n))
    setSelectedElement(prev => (prev?.id === node.id) ? { ...node, data: { ...node.data, domain: newDomain } } : prev)
  }, [])

  const handleSaveNode = (formData) => {
    if (selectedElement.type === 'new') {
      setNodes(nds => [...nds, { id: generateUUID(), type: 'clinical', position: generateNodePosition(formData.domain), data: formData }])
    } else {
      setNodes(nds => nds.map(n => {
        if (n.id !== selectedElement.id) return n
        const isNewDomain = n.data.domain !== formData.domain
        return {
          ...n,
          position: isNewDomain ? generateNodePosition(formData.domain) : n.position,
          data: { ...formData, isExpanded: n.data.isExpanded },
        }
      }))
    }
    setIsSidebarOpen(false)
    updateFocus(null, edges)
  }

  const handleSaveEdge = (formData) => {
    setEdges(eds => eds.map(e => {
      if (e.id !== selectedElement.id) return e
      const color = formData.relationship_type === 'positive' ? '#22c55e' : '#ef4444'
      return { ...e, data: formData, markerEnd: { type: MarkerType.ArrowClosed, color } }
    }))
    setIsSidebarOpen(false)
  }

  const handleDelete = () => {
    if (selectedElement.type === 'clinical' || selectedElement.type === 'new') {
      setNodes(nds => nds.filter(n => n.id !== selectedElement.id))
      setEdges(eds => eds.filter(e => e.source !== selectedElement.id && e.target !== selectedElement.id))
    } else if (selectedElement.type === 'impact') {
      setEdges(eds => eds.filter(e => e.id !== selectedElement.id))
    }
    setIsSidebarOpen(false)
    setSelectedElement(null)
    updateFocus(null, edges)
  }

  const handleExportPNG = async () => {
    setIsExporting(true)
    try {
      if (rfInstance) {
        rfInstance.fitBounds({ x: -1000, y: -1000, width: 2000, height: 2000 }, { duration: 0 })
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      const flowElement = document.getElementById('in-the-room-body-map-export')
      if (!flowElement) throw new Error('Could not find the map canvas.')
      const dataUrl = await toPng(flowElement, {
        backgroundColor: '#f8f9fa',
        pixelRatio: 2,
        filter: (node) => !node?.classList?.contains('react-flow__controls'),
      })
      const link = document.createElement('a')
      link.download = `InTheRoom_BodyMap_${client?.real_name?.replace(/\s+/g, '_') || 'Client'}.png`
      link.href = dataUrl
      link.click()
    } catch {
      toast.error('Failed to export image.')
    } finally {
      setIsExporting(false)
    }
  }

  const renderedNodes = nodes.map(n => ({ ...n, data: { ...n.data, isLineMode: mode === 'lines' } }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg-surface)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, color: 'var(--col-accent)', fontSize: '1.15rem' }}>Body map: {client?.real_name || 'Client'}</h2>

        <div style={{ display: 'flex', gap: '5px', background: '#f1f5f9', padding: '6px', borderRadius: '8px' }}>
          {['view', 'nodes', 'lines'].map(m => (
            <button key={m} onClick={() => { setMode(m); setIsSidebarOpen(false) }} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: mode === m ? '#fff' : 'transparent', cursor: 'pointer', fontWeight: 'bold' }}>
              {m === 'view' ? '🔍 View' : m === 'nodes' ? '🟦 Nodes' : '🔗 Lines'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="secondary" onClick={() => setIsLegendOpen(true)}>ℹ️ Legend</button>
          <button className="primary" onClick={() => { setSelectedElement({ type: 'new', id: generateUUID(), data: { label: '', domain: 'middle_cognitive', is_intervention: false } }); setIsSidebarOpen(true); setMode('nodes') }}>➕ Add node</button>
          <button type="button" className="secondary" onClick={handleExportPNG} disabled={isExporting}>{isExporting ? 'Exporting…' : 'Export PNG'}</button>
          <button type="button" className="primary" onClick={handleSaveSnapshot} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
        <div id="in-the-room-body-map-export" style={{ flex: 1, position: 'relative', background: '#f8f9fa' }}>
          <ReactFlowProvider>
            <ConcentricBackground />
            <ReactFlow
              nodes={renderedNodes}
              edges={edges}
              onInit={setRfInstance}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              onNodeDragStop={onNodeDragStop}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={mode === 'nodes'}
              nodesConnectable={mode === 'lines'}
              elementsSelectable={mode !== 'view'}
              connectionMode={ConnectionMode.Loose}
              fitView
              minZoom={0.05}
              style={{ background: 'transparent' }}
            >
              <Controls />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <div style={{ width: '350px', background: '#fff', borderLeft: '1px solid #ddd', transform: isSidebarOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.3s', position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 20 }}>
          {isSidebarOpen && selectedElement && (
            <SidebarForm element={selectedElement} onSave={selectedElement.type === 'impact' ? handleSaveEdge : handleSaveNode} onDelete={handleDelete} onClose={() => setIsSidebarOpen(false)} />
          )}
        </div>
      </div>

      {isLegendOpen && <LegendModal onClose={() => setIsLegendOpen(false)} />}
    </div>
  )
}

function SidebarForm({ element, onSave, onDelete, onClose }) {
  const [formData, setFormData] = useState(element.data || {})
  useEffect(() => { setFormData(element.data || {}) }, [element])
  const isEdge = element.type === 'impact'

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>{isEdge ? 'Edit connection' : 'Edit node'}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✖</button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {!isEdge ? (
          <>
            <input type="text" className="paper-input" placeholder="Label" value={formData.label || ''} onChange={e => setFormData({ ...formData, label: e.target.value })} />
            <textarea className="paper-input" placeholder="Description" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} style={{ minHeight: '80px' }} />
            <select className="paper-input" value={formData.domain || 'middle_cognitive'} onChange={e => setFormData({ ...formData, domain: e.target.value })}>
              <option value="center_physiological">Physiological</option>
              <option value="middle_affective">Affective</option>
              <option value="middle_cognitive">Cognitive</option>
              <option value="middle_attentional">Attentional</option>
              <option value="middle_self">Self</option>
              <option value="middle_motivational">Motivational</option>
              <option value="middle_behavioral">Behavioral</option>
              <option value="outer_systemic">Systemic / Context</option>
            </select>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="checkbox" checked={formData.is_intervention || false} onChange={e => setFormData({ ...formData, is_intervention: e.target.checked })} />
              Flag as intervention
            </label>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setFormData({ ...formData, relationship_type: 'positive' })} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: formData.relationship_type === 'positive' ? '2px solid #2ecc71' : '1px solid #ccc' }}>+ Positive</button>
              <button onClick={() => setFormData({ ...formData, relationship_type: 'negative' })} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: formData.relationship_type === 'negative' ? '2px solid #e74c3c' : '1px solid #ccc' }}>- Negative</button>
            </div>
            <label>Strength: {formData.weight || 1}</label>
            <input type="range" min="1" max="5" value={formData.weight || 1} onChange={e => setFormData({ ...formData, weight: parseInt(e.target.value) })} />
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
        <button className="primary" style={{ flex: 2 }} onClick={() => onSave(formData)}>Save</button>
        <button className="secondary" style={{ flex: 1, color: '#e74c3c' }} onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}

function LegendModal({ onClose }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div className="card" style={{ maxWidth: '600px', padding: '30px' }} onClick={e => e.stopPropagation()}>
        <h2>Body Map legend</h2>
        <p>Green arrows show excitatory links; red arrows show inhibitory links. Line thickness reflects clinical weight.</p>
        <p>The concentric rings map physiological (centre), psychological flexibility processes (middle), and systemic context (outer).</p>
        <button className="primary" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
