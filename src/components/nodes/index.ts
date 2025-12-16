import type { NodeTypes } from 'reactflow';
import { StepNode } from './StepNode';
import { TriggerNode } from './TriggerNode';
import { PolicyNode } from './PolicyNode';
import { PolicyOutputNode } from './PolicyOutputNode';

// Registry des types de nœuds pour React Flow
export const nodeTypes: NodeTypes = {
  step: StepNode,
  trigger: TriggerNode,
  policy: PolicyNode,
  policyOutput: PolicyOutputNode,  // Nœud secondaire, créé automatiquement avec PolicyNode
};

// Liste des types disponibles pour la sidebar
export const availableNodeTypes = [
  { type: 'trigger', label: 'Trigger', icon: '▶', color: '#22c55e' },
  { type: 'step', label: 'Event', icon: '📌', color: '#FF8C00' },
  { type: 'policy', label: 'Policy', icon: '⚖', color: '#9333ea' },
] as const;
