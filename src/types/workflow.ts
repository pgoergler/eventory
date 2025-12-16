// Types de nœuds extensibles
export type NodeType = 'step';

// Données communes à tous les nœuds
export interface BaseNodeData {
  label: string;
}

// Données spécifiques au nœud "step"
export interface StepNodeData extends BaseNodeData {
  description?: string;
}

// Union type pour toutes les données de nœuds
export type WorkflowNodeData = StepNodeData;

// Constantes pour les clés localStorage
export const STORAGE_KEY = 'workflow-designer-state';
