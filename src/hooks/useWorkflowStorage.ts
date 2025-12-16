import { useCallback, useEffect, useRef } from 'react';
import type { Node, Edge } from 'reactflow';
import { STORAGE_KEY } from '../types/workflow';

interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
}

interface UseWorkflowStorageReturn {
  saveWorkflow: (nodes: Node[], edges: Edge[]) => void;
  loadWorkflow: () => WorkflowState | null;
  clearWorkflow: () => void;
}

export function useWorkflowStorage(): UseWorkflowStorageReturn {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveWorkflow = useCallback((nodes: Node[], edges: Edge[]) => {
    // Debounce pour éviter trop de sauvegardes
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      const state: WorkflowState = { nodes, edges };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.error('Erreur lors de la sauvegarde du workflow:', error);
      }
    }, 300);
  }, []);

  const loadWorkflow = useCallback((): WorkflowState | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as WorkflowState;
      }
    } catch (error) {
      console.error('Erreur lors du chargement du workflow:', error);
    }
    return null;
  }, []);

  const clearWorkflow = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Erreur lors de la suppression du workflow:', error);
    }
  }, []);

  // Nettoyage du timer au démontage
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return { saveWorkflow, loadWorkflow, clearWorkflow };
}
