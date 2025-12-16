import { memo, useCallback, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { BaseNodeData } from '../../types/workflow';

interface TriggerNodeProps extends NodeProps<BaseNodeData> {
  data: BaseNodeData & {
    onTrigger?: (nodeId: string) => void;
    onLabelChange?: (nodeId: string, newLabel: string) => void;
    isActive?: boolean;
  };
}

const TRIGGER_GREEN = '#22c55e';

function TriggerNodeComponent({ id, data, selected }: TriggerNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(() => {
    if (data.onTrigger) {
      data.onTrigger(id);
    }
  }, [id, data]);

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

  return (
    <div
      className={`trigger-node ${selected ? 'selected' : ''} ${data.isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
      style={{
        backgroundColor: TRIGGER_GREEN,
        width: 48,
        height: 48,
        borderRadius: '100%',
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="Démarrer le workflow"
    >
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />

      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" className="trigger-icon">
        <path d="M8 5v14l11-7z" />
      </svg>

      <div className="trigger-label-container">
        {isEditing ? (
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="trigger-label-input"
          />
        ) : (
          <span className="trigger-label" onDoubleClick={handleDoubleClick}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export const TriggerNode = memo(TriggerNodeComponent);
