import { memo, useCallback, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { PolicyNodeData, PolicyOutput } from '../../types/workflow';

const POLICY_PURPLE = '#9333ea';
const EXECUTED_GREEN = '#22c55e';

interface ExtendedPolicyNodeData extends PolicyNodeData {
  isActive?: boolean;
  isExecuted?: boolean;
  isLoading?: boolean;
  isEdgeHovered?: boolean;
  isWaitingForDecision?: boolean;
  onLabelChange?: (nodeId: string, newLabel: string) => void;
  onOutputsChange?: (nodeId: string, outputs: PolicyOutput[]) => void;
}

function PolicyNodeComponent({ id, data, selected }: NodeProps<ExtendedPolicyNodeData>) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const [isEditingOutputs, setIsEditingOutputs] = useState(false);

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

  const handleAddOutput = useCallback(() => {
    const newOutput: PolicyOutput = {
      id: `output_${Date.now()}`,
      label: `Option ${data.outputs.length + 1}`,
      position: 'right',
    };
    if (data.onOutputsChange) {
      data.onOutputsChange(id, [...data.outputs, newOutput]);
    }
  }, [id, data]);

  const handleRemoveOutput = useCallback((outputId: string) => {
    if (data.outputs.length <= 2) return;
    if (data.onOutputsChange) {
      data.onOutputsChange(id, data.outputs.filter(o => o.id !== outputId));
    }
  }, [id, data]);

  const handleOutputLabelChange = useCallback((outputId: string, newLabel: string) => {
    if (data.onOutputsChange) {
      data.onOutputsChange(id, data.outputs.map(o =>
        o.id === outputId ? { ...o, label: newLabel } : o
      ));
    }
  }, [id, data]);

  const nodeColor = data.isExecuted ? EXECUTED_GREEN : POLICY_PURPLE;

  return (
    <div
      className={`policy-node ${selected ? 'selected' : ''} ${data.isActive ? 'active' : ''} ${data.isExecuted ? 'executed' : ''} ${data.isLoading ? 'loading' : ''} ${data.isEdgeHovered ? 'edge-hovered' : ''} ${data.isWaitingForDecision ? 'waiting-decision' : ''}`}
      style={{
        borderColor: nodeColor,
        backgroundColor: nodeColor,
      }}
    >
      {/* Handles d'entrée (target) sur tous les côtés */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="policy-input-handle"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="policy-input-handle"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        className="policy-input-handle"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        className="policy-input-handle"
      />

      {/* Spinner de chargement */}
      {data.isLoading && !data.isWaitingForDecision && (
        <div className="node-loading-spinner">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
          </svg>
        </div>
      )}

      <div className="policy-content">
        {/* Label du nœud */}
        <div className="policy-header">
          {isEditing ? (
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              autoFocus
              className="policy-label-input"
            />
          ) : (
            <span className="policy-label" onDoubleClick={handleDoubleClick}>
              {label}
            </span>
          )}
        </div>

        {/* Éditeur de sorties */}
        {selected && !data.isWaitingForDecision && !data.isLoading && (
          <div className="policy-outputs-editor">
            <button
              className="policy-edit-outputs-button"
              onClick={() => setIsEditingOutputs(!isEditingOutputs)}
              title="Gérer les sorties"
            >
              {isEditingOutputs ? '✓' : '⚙'}
            </button>
            {isEditingOutputs && (
              <div className="policy-outputs-list">
                {data.outputs.map((output) => (
                  <div key={output.id} className="policy-output-item">
                    <input
                      type="text"
                      value={output.label}
                      onChange={(e) => handleOutputLabelChange(output.id, e.target.value)}
                      className="policy-output-input"
                    />
                    {data.outputs.length > 2 && (
                      <button
                        className="policy-remove-output"
                        onClick={() => handleRemoveOutput(output.id)}
                        title="Supprimer cette sortie"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button className="policy-add-output" onClick={handleAddOutput}>
                  + Ajouter une sortie
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const PolicyNode = memo(PolicyNodeComponent);
