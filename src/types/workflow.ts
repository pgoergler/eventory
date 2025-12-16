// Types de nœuds extensibles
export type NodeType = 'step' | 'policy';

// Données communes à tous les nœuds
export interface BaseNodeData {
  label: string;
}

// Données spécifiques au nœud "step"
export interface StepNodeData extends BaseNodeData {
  description?: string;
}

// Output pour le nœud Policy
export interface PolicyOutput {
  id: string;
  label: string;
}

// Données spécifiques au nœud "policy"
export interface PolicyNodeData extends BaseNodeData {
  outputs: PolicyOutput[];
}

// Union type pour toutes les données de nœuds
export type WorkflowNodeData = StepNodeData | PolicyNodeData;

// Constantes pour les clés localStorage
export const STORAGE_KEY = 'workflow-designer-state';
