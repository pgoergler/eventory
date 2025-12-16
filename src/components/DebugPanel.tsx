import { memo, useState, useCallback } from 'react';
import type { Node, Edge } from 'reactflow';

interface DebugPanelProps {
  nodes: Node[];
  edges: Edge[];
  executedNodes: Set<string>;
  activeNodes: Set<string>;
  waitingForDecision: Set<string>;
  executedEdges: Set<string>;
  animatingEdges: Set<string>;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
}

function DebugPanelComponent({
  nodes,
  edges,
  executedNodes,
  activeNodes,
  waitingForDecision,
  executedEdges,
  animatingEdges,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
}: DebugPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'nodes' | 'edges'>('nodes');

  const getNodeStatus = useCallback((nodeId: string) => {
    if (executedNodes.has(nodeId)) return 'executed';
    if (activeNodes.has(nodeId)) return 'active';
    if (waitingForDecision.has(nodeId)) return 'waiting';
    return 'idle';
  }, [executedNodes, activeNodes, waitingForDecision]);

  const getEdgeStatus = useCallback((edgeId: string) => {
    if (executedEdges.has(edgeId)) return 'executed';
    if (animatingEdges.has(edgeId)) return 'animating';
    return 'idle';
  }, [executedEdges, animatingEdges]);

  const getOutgoingEdges = useCallback((nodeId: string) => {
    return edges.filter(e => e.source === nodeId);
  }, [edges]);

  const getIncomingEdges = useCallback((nodeId: string) => {
    return edges.filter(e => e.target === nodeId);
  }, [edges]);

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
  const selectedEdge = selectedEdgeId ? edges.find(e => e.id === selectedEdgeId) : null;

  const getNodeLabel = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.data?.label || nodeId;
  }, [nodes]);

  if (!isVisible) {
    return (
      <button
        className="debug-toggle-button"
        onClick={() => setIsVisible(true)}
        title="Show Debug Panel"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/>
        </svg>
      </button>
    );
  }

  return (
    <div className="debug-panel">
      <div className="debug-panel-header">
        <h3>Debug Panel</h3>
        <button
          className="debug-close-button"
          onClick={() => setIsVisible(false)}
          title="Hide Debug Panel"
        >
          ×
        </button>
      </div>

      <div className="debug-tabs">
        <button
          className={`debug-tab ${activeTab === 'nodes' ? 'active' : ''}`}
          onClick={() => setActiveTab('nodes')}
        >
          Nodes ({nodes.length})
        </button>
        <button
          className={`debug-tab ${activeTab === 'edges' ? 'active' : ''}`}
          onClick={() => setActiveTab('edges')}
        >
          Edges ({edges.length})
        </button>
      </div>

      <div className="debug-content">
        {activeTab === 'nodes' && (
          <div className="debug-list">
            {nodes.map(node => {
              const status = getNodeStatus(node.id);
              const isSelected = node.id === selectedNodeId;
              return (
                <div
                  key={node.id}
                  className={`debug-list-item ${isSelected ? 'selected' : ''} status-${status}`}
                  onClick={() => onSelectNode(node.id)}
                >
                  <span className="debug-item-type">{node.type || '?'}</span>
                  <span className="debug-item-label" title={node.id}>
                    {(node.data?.label && node.data.label.trim()) || node.id}
                  </span>
                  <span className={`debug-item-status ${status}`}>{status}</span>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'edges' && (
          <div className="debug-list">
            {edges.map(edge => {
              const status = getEdgeStatus(edge.id);
              const isSelected = edge.id === selectedEdgeId;
              const sourceLabel = getNodeLabel(edge.source);
              const targetLabel = getNodeLabel(edge.target);
              return (
                <div
                  key={edge.id}
                  className={`debug-list-item ${isSelected ? 'selected' : ''} status-${status}`}
                  onClick={() => onSelectEdge(edge.id)}
                >
                  <span className="debug-edge-info">
                    {sourceLabel} → {targetLabel}
                  </span>
                  <span className={`debug-item-status ${status}`}>{status}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selection Details */}
      <div className="debug-details">
        <h4>Selection Details</h4>
        {selectedNode && (
          <div className="debug-selection">
            <div className="debug-detail-row">
              <span className="debug-detail-label">ID:</span>
              <span className="debug-detail-value">{selectedNode.id}</span>
            </div>
            <div className="debug-detail-row">
              <span className="debug-detail-label">Type:</span>
              <span className="debug-detail-value">{selectedNode.type}</span>
            </div>
            <div className="debug-detail-row">
              <span className="debug-detail-label">Label:</span>
              <span className="debug-detail-value">{selectedNode.data?.label || '-'}</span>
            </div>
            <div className="debug-detail-row">
              <span className="debug-detail-label">Status:</span>
              <span className={`debug-detail-value status-${getNodeStatus(selectedNode.id)}`}>
                {getNodeStatus(selectedNode.id)}
              </span>
            </div>
            <div className="debug-detail-row">
              <span className="debug-detail-label">Position:</span>
              <span className="debug-detail-value">
                x: {Math.round(selectedNode.position.x)}, y: {Math.round(selectedNode.position.y)}
              </span>
            </div>

            <div className="debug-edges-section">
              <h5>Outgoing Edges ({getOutgoingEdges(selectedNode.id).length})</h5>
              {getOutgoingEdges(selectedNode.id).map(edge => (
                <div
                  key={edge.id}
                  className="debug-edge-item"
                  onClick={() => onSelectEdge(edge.id)}
                >
                  → {getNodeLabel(edge.target)}
                  <span className={`debug-item-status ${getEdgeStatus(edge.id)}`}>
                    {getEdgeStatus(edge.id)}
                  </span>
                </div>
              ))}
              {getOutgoingEdges(selectedNode.id).length === 0 && (
                <div className="debug-no-edges">No outgoing edges</div>
              )}
            </div>

            <div className="debug-edges-section">
              <h5>Incoming Edges ({getIncomingEdges(selectedNode.id).length})</h5>
              {getIncomingEdges(selectedNode.id).map(edge => (
                <div
                  key={edge.id}
                  className="debug-edge-item"
                  onClick={() => onSelectEdge(edge.id)}
                >
                  ← {getNodeLabel(edge.source)}
                  <span className={`debug-item-status ${getEdgeStatus(edge.id)}`}>
                    {getEdgeStatus(edge.id)}
                  </span>
                </div>
              ))}
              {getIncomingEdges(selectedNode.id).length === 0 && (
                <div className="debug-no-edges">No incoming edges</div>
              )}
            </div>
          </div>
        )}

        {selectedEdge && !selectedNode && (
          <div className="debug-selection">
            <div className="debug-detail-row">
              <span className="debug-detail-label">ID:</span>
              <span className="debug-detail-value debug-edge-id">{selectedEdge.id}</span>
            </div>
            <div className="debug-detail-row">
              <span className="debug-detail-label">Type:</span>
              <span className="debug-detail-value">{selectedEdge.type || 'default'}</span>
            </div>
            <div className="debug-detail-row">
              <span className="debug-detail-label">Status:</span>
              <span className={`debug-detail-value status-${getEdgeStatus(selectedEdge.id)}`}>
                {getEdgeStatus(selectedEdge.id)}
              </span>
            </div>
            <div className="debug-detail-row">
              <span className="debug-detail-label">Source:</span>
              <span
                className="debug-detail-value debug-clickable"
                onClick={() => onSelectNode(selectedEdge.source)}
              >
                {getNodeLabel(selectedEdge.source)} ({selectedEdge.source})
              </span>
            </div>
            <div className="debug-detail-row">
              <span className="debug-detail-label">Source Handle:</span>
              <span className="debug-detail-value">{selectedEdge.sourceHandle || 'default'}</span>
            </div>
            <div className="debug-detail-row">
              <span className="debug-detail-label">Target:</span>
              <span
                className="debug-detail-value debug-clickable"
                onClick={() => onSelectNode(selectedEdge.target)}
              >
                {getNodeLabel(selectedEdge.target)} ({selectedEdge.target})
              </span>
            </div>
            <div className="debug-detail-row">
              <span className="debug-detail-label">Target Handle:</span>
              <span className="debug-detail-value">{selectedEdge.targetHandle || 'default'}</span>
            </div>
          </div>
        )}

        {!selectedNode && !selectedEdge && (
          <div className="debug-no-selection">
            Select a node or edge to see details
          </div>
        )}
      </div>
    </div>
  );
}

export const DebugPanel = memo(DebugPanelComponent);