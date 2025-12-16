// Types de nœuds extensibles
export type NodeType = 'step' | 'policy' | 'policyOutput';

// Données communes à tous les nœuds
export interface BaseNodeData {
  label: string;
}

// Données spécifiques au nœud "step"
export interface StepNodeData extends BaseNodeData {
  description?: string;
}

// Position des handles de sortie pour le nœud Policy
export type HandlePosition = 'right' | 'bottom' | 'left';

// Output pour le nœud Policy
export interface PolicyOutput {
  id: string;
  label: string;
  position: HandlePosition;  // Position du handle (right, bottom, left)
  offset?: number;           // Décalage en % le long du côté (0-100), défaut 50
}

// Données spécifiques au nœud "policy"
export interface PolicyNodeData extends BaseNodeData {
  outputs: PolicyOutput[];
  outputNodeIds?: string[];  // IDs des PolicyOutputNodes enfants
}

// Données spécifiques au nœud "policyOutput" (nœud secondaire)
export interface PolicyOutputNodeData extends BaseNodeData {
  parentPolicyId: string;  // ID du PolicyNode parent
  outputId: string;        // ID de la sortie dans le parent
  relativePosition: { x: number; y: number };  // Position relative au parent
}

// Union type pour toutes les données de nœuds
export type WorkflowNodeData = StepNodeData | PolicyNodeData | PolicyOutputNodeData;

// Constantes pour les clés localStorage
export const STORAGE_KEY = 'workflow-designer-state';
