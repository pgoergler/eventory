import { memo } from 'react';
import type { NodeProps } from 'reactflow';
import { BaseNode } from './BaseNode';
import type { StepNodeData } from '../../types/workflow';

// Orange Event Storming style
const EVENT_ORANGE = '#FF8C00';

function StepNodeComponent(props: NodeProps<StepNodeData>) {
  return <BaseNode {...props} color={EVENT_ORANGE} />;
}

export const StepNode = memo(StepNodeComponent);
