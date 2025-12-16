import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { BaseNodeData } from '../../types/workflow';

interface TriggerNodeProps extends NodeProps<BaseNodeData> {
  data: BaseNodeData & {
    onTrigger?: (nodeId: string) => void;
    isActive?: boolean;
  };
}

const TRIGGER_GREEN = '#22c55e';

function TriggerNodeComponent({ id, data, selected }: TriggerNodeProps) {
  const handleClick = useCallback(() => {
    if (data.onTrigger) {
      data.onTrigger(id);
    }
  }, [id, data]);

  return (
    <div
      className={`trigger-node ${selected ? 'selected' : ''} ${data.isActive ? 'active' : ''}`}
      style={{
        borderColor: TRIGGER_GREEN,
        backgroundColor: TRIGGER_GREEN
      }}
    >
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />

      <div className="trigger-content">
        <button
          className="trigger-play-button"
          onClick={handleClick}
          title="Démarrer le workflow"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <span className="trigger-label">{data.label}</span>
      </div>
    </div>
  );
}

export const TriggerNode = memo(TriggerNodeComponent);
