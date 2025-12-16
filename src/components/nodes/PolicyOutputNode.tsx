import { memo, useCallback, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { PolicyOutputNodeData } from '../../types/workflow';

interface ExtendedPolicyOutputNodeData extends PolicyOutputNodeData {
  isWaitingForDecision?: boolean;
  isExecuted?: boolean;
  isEdgeHovered?: boolean;
  isConnected?: boolean;
  isTriggered?: boolean;
  onOutputDecision?: (parentPolicyId: string, outputId: string) => void;
  onLabelChange?: (nodeId: string, newLabel: string) => void;
  onTriggerFromOutput?: (nodeId: string) => void;
}

function PolicyOutputNodeComponent({ id, data, selected }: NodeProps<ExtendedPolicyOutputNodeData>) {
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

  const handleDecision = useCallback(() => {
    if (data.onOutputDecision) {
      data.onOutputDecision(data.parentPolicyId, data.outputId);
    }
  }, [data]);

  const handleTriggerSimulation = useCallback(() => {
    if (data.onTriggerFromOutput) {
      data.onTriggerFromOutput(id);
    }
  }, [id, data]);

  return (
    <div
      className={`policy-output-node ${selected ? 'selected' : ''} ${data.isExecuted ? 'executed' : ''} ${data.isWaitingForDecision ? 'waiting-decision' : ''} ${data.isEdgeHovered ? 'edge-hovered' : ''} ${data.isConnected ? 'connected' : ''} ${data.isTriggered ? 'triggered' : ''}`}
    >
      {/* Handles de sortie sur tous les côtés */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={`policy-output-handle ${data.isConnected ? 'connected' : ''}`}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className={`policy-output-handle ${data.isConnected ? 'connected' : ''}`}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className={`policy-output-handle ${data.isConnected ? 'connected' : ''}`}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        className={`policy-output-handle ${data.isConnected ? 'connected' : ''}`}
      />

      {/* Label */}
      <div className="policy-output-content">
        {isEditing ? (
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="policy-output-input"
          />
        ) : (
          <span className="policy-output-label" onDoubleClick={handleDoubleClick}>
            {data.label}
          </span>
        )}

        {/* Bouton trigger violet - visible quand connecté et PAS en attente */}
        {data.isConnected && !data.isWaitingForDecision && (
          <button
            className="policy-output-trigger"
            onClick={handleTriggerSimulation}
            title={`Démarrer depuis: ${data.label}`}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}

        {/* Bouton play vert - visible uniquement en attente de décision */}
        {data.isWaitingForDecision && data.isConnected && (
          <button
            className="policy-output-play"
            onClick={handleDecision}
            title={`Choisir: ${data.label}`}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export const PolicyOutputNode = memo(PolicyOutputNodeComponent);
