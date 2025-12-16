import { memo, useCallback, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { BaseNodeData } from '../../types/workflow';

const EXECUTED_GREEN = '#22c55e';

interface ExtendedNodeData extends BaseNodeData {
  isActive?: boolean;
  isExecuted?: boolean;
  isLoading?: boolean;
  isEdgeHovered?: boolean;
  onExecute?: (nodeId: string) => void;
  onLabelChange?: (nodeId: string, newLabel: string) => void;
}

interface BaseNodeProps extends NodeProps<ExtendedNodeData> {
  color?: string;
}

function BaseNodeComponent({ id, data, selected, color = '#FF8C00' }: BaseNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (data.onLabelChange) {
      data.onLabelChange(id, label);
    }
  }, [id, data, label]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        setIsEditing(false);
        if (data.onLabelChange) {
          data.onLabelChange(id, label);
        }
      }
      if (e.key === 'Escape') {
        setLabel(data.label);
        setIsEditing(false);
      }
    },
    [id, data, label]
  );

  const handleExecute = useCallback(() => {
    if (data.onExecute) {
      data.onExecute(id);
    }
  }, [id, data]);

  const nodeColor = data.isExecuted ? EXECUTED_GREEN : color;

  return (
    <div
      className={`base-node ${selected ? 'selected' : ''} ${data.isActive ? 'active' : ''} ${data.isExecuted ? 'executed' : ''} ${data.isLoading ? 'loading' : ''} ${data.isEdgeHovered ? 'edge-hovered' : ''}`}
      style={{ borderColor: nodeColor, backgroundColor: nodeColor }}
    >
      {/* Handles sur les 4 côtés - chaque handle peut recevoir et envoyer */}
      <Handle type="source" position={Position.Top} id="top" isConnectableStart={true} isConnectableEnd={true} />
      <Handle type="source" position={Position.Left} id="left" isConnectableStart={true} isConnectableEnd={true} />
      <Handle type="source" position={Position.Bottom} id="bottom" isConnectableStart={true} isConnectableEnd={true} />
      <Handle type="source" position={Position.Right} id="right" isConnectableStart={true} isConnectableEnd={true} />

      {data.isActive && (
        <button
          className="node-play-button"
          onClick={handleExecute}
          title="Exécuter cette étape"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      {/* Spinner de chargement */}
      {data.isLoading && (
        <div className="node-loading-spinner">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
          </svg>
        </div>
      )}

      <div className="node-content">
        {isEditing ? (
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="node-label-input"
          />
        ) : (
          <span className="node-label" onDoubleClick={handleDoubleClick}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export const BaseNode = memo(BaseNodeComponent);
