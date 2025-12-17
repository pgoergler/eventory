import { useCallback, useRef, useState } from 'react';
import type { Edge, Node } from 'reactflow';
import type { PolicyOutputNodeData } from '../types/workflow';
import { SIMULATION_DELAY } from '../constants/workflow';

export interface SimulationState {
  executedNodes: Set<string>;
  activeNodes: Set<string>;
  executedEdges: Set<string>;
  animatingEdges: Set<string>;
  waitingForDecision: Set<string>;
  triggeredOutputNodes: Set<string>;
}

export interface UseSimulationReturn {
  // State
  executedNodes: Set<string>;
  activeNodes: Set<string>;
  executedEdges: Set<string>;
  animatingEdges: Set<string>;
  waitingForDecision: Set<string>;
  triggeredOutputNodes: Set<string>;

  // State setters (for edge enrichment)
  setExecutedEdges: React.Dispatch<React.SetStateAction<Set<string>>>;
  setAnimatingEdges: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Functions
  getLinkedNodes: (sourceNodeId: string) => Set<string>;
  resetLinkedNodes: (triggerNodeId: string) => void;
  handleExecuteNode: (nodeId: string) => void;
  handlePolicyDecision: (parentPolicyId: string, outputId: string) => void;
  handleTrigger: (triggerId: string) => void;
  handleTriggerFromOutput: (outputNodeId: string) => void;
  handleResetSimulation: () => void;

  // Helpers
  isSimulationActive: boolean;
}

interface UseSimulationOptions {
  nodes: Node[];
  edges: Edge[];
}

export function useSimulation({ nodes, edges }: UseSimulationOptions): UseSimulationReturn {
  // Simulation state
  const [executedNodes, setExecutedNodes] = useState<Set<string>>(new Set());
  const [activeNodes, setActiveNodes] = useState<Set<string>>(new Set());
  const [executedEdges, setExecutedEdges] = useState<Set<string>>(new Set());
  const [animatingEdges, setAnimatingEdges] = useState<Set<string>>(new Set());
  const [waitingForDecision, setWaitingForDecision] = useState<Set<string>>(new Set());
  const [triggeredOutputNodes, setTriggeredOutputNodes] = useState<Set<string>>(new Set());

  // Timeouts ref
  const simulationTimeouts = useRef<number[]>([]);

  // Find all linked nodes from a source (BFS through edges)
  const getLinkedNodes = useCallback(
    (sourceNodeId: string): Set<string> => {
      const linkedNodes = new Set<string>();
      const visited = new Set<string>();
      const queue = [sourceNodeId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const outgoingEdges = edges.filter((e) => e.source === currentId);
        for (const edge of outgoingEdges) {
          if (!visited.has(edge.target)) {
            linkedNodes.add(edge.target);
            queue.push(edge.target);
          }
        }
      }

      return linkedNodes;
    },
    [edges]
  );

  // Reset linked nodes from a trigger
  const resetLinkedNodes = useCallback(
    (triggerNodeId: string) => {
      const linkedNodes = getLinkedNodes(triggerNodeId);

      // Cancel ongoing timeouts
      simulationTimeouts.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      simulationTimeouts.current = [];

      // Remove linked nodes from simulation states
      setExecutedNodes((prev) => {
        const next = new Set(prev);
        linkedNodes.forEach((id) => next.delete(id));
        return next;
      });
      setActiveNodes((prev) => {
        const next = new Set(prev);
        linkedNodes.forEach((id) => next.delete(id));
        return next;
      });
      setWaitingForDecision((prev) => {
        const next = new Set(prev);
        linkedNodes.forEach((id) => next.delete(id));
        return next;
      });

      // Remove linked edges
      const linkedEdgeIds = edges
        .filter((e) => linkedNodes.has(e.source) || e.source === triggerNodeId)
        .map((e) => e.id);
      setExecutedEdges((prev) => {
        const next = new Set(prev);
        linkedEdgeIds.forEach((id) => next.delete(id));
        return next;
      });
      setAnimatingEdges((prev) => {
        const next = new Set(prev);
        linkedEdgeIds.forEach((id) => next.delete(id));
        return next;
      });
    },
    [edges, getLinkedNodes]
  );

  // Execute a node (simulation)
  const handleExecuteNode = useCallback(
    (nodeIdToExecute: string) => {
      const nodeToExecute = nodes.find((n) => n.id === nodeIdToExecute);

      // Policy nodes wait for manual decision
      if (nodeToExecute?.type === 'policy') {
        setWaitingForDecision((prev) => new Set([...prev, nodeIdToExecute]));
        return;
      }

      // Mark node as executed
      setExecutedNodes((prev) => new Set([...prev, nodeIdToExecute]));
      setActiveNodes((prev) => {
        const next = new Set(prev);
        next.delete(nodeIdToExecute);
        return next;
      });

      // Find all outgoing edges
      const outgoingEdges = edges.filter((e) => e.source === nodeIdToExecute);

      if (outgoingEdges.length > 0) {
        // Start animation on all outgoing edges
        const outgoingEdgeIds = outgoingEdges.map((e) => e.id);
        setAnimatingEdges((prev) => new Set([...prev, ...outgoingEdgeIds]));

        // Schedule animation end for each edge
        outgoingEdges.forEach((edge) => {
          const targetNode = nodes.find((n) => n.id === edge.target);
          const isTargetTrigger = targetNode?.type === 'trigger';

          const timeoutId = window.setTimeout(() => {
            // Mark edge as executed (end of animation)
            setAnimatingEdges((prev) => {
              const next = new Set(prev);
              next.delete(edge.id);
              return next;
            });
            setExecutedEdges((prev) => new Set([...prev, edge.id]));

            // Execute next node UNLESS it's a trigger
            if (!isTargetTrigger) {
              handleExecuteNode(edge.target);
            }
          }, SIMULATION_DELAY);
          simulationTimeouts.current.push(timeoutId);
        });
      }
    },
    [edges, nodes]
  );

  // Handle policy decision (called from PolicyOutputNode)
  const handlePolicyDecision = useCallback(
    (parentPolicyId: string, outputId: string) => {
      // Find the corresponding PolicyOutputNode
      const outputNode = nodes.find(
        (n) =>
          n.type === 'policyOutput' &&
          (n.data as PolicyOutputNodeData).parentPolicyId === parentPolicyId &&
          (n.data as PolicyOutputNodeData).outputId === outputId
      );

      if (!outputNode) return;

      // Find all PolicyOutputNodes of this PolicyNode
      const allOutputNodes = nodes.filter(
        (n) =>
          n.type === 'policyOutput' &&
          (n.data as PolicyOutputNodeData).parentPolicyId === parentPolicyId
      );

      // Reset nodes linked to ALL outputs (including chosen one, to handle loops)
      const allLinkedNodes = new Set<string>();
      const allLinkedEdgeIds = new Set<string>();

      for (const policyOutput of allOutputNodes) {
        const linkedNodes = getLinkedNodes(policyOutput.id);
        linkedNodes.forEach((id) => allLinkedNodes.add(id));

        edges
          .filter(
            (e) =>
              linkedNodes.has(e.source) ||
              linkedNodes.has(e.target) ||
              e.source === policyOutput.id
          )
          .forEach((e) => allLinkedEdgeIds.add(e.id));
      }

      // Reset all linked nodes
      setExecutedNodes((prev) => {
        const next = new Set(prev);
        allLinkedNodes.forEach((id) => next.delete(id));
        return next;
      });
      setActiveNodes((prev) => {
        const next = new Set(prev);
        allLinkedNodes.forEach((id) => next.delete(id));
        return next;
      });
      setWaitingForDecision((prev) => {
        const next = new Set(prev);
        allLinkedNodes.forEach((id) => next.delete(id));
        return next;
      });

      // Reset all linked edges
      setExecutedEdges((prev) => {
        const next = new Set(prev);
        allLinkedEdgeIds.forEach((id) => next.delete(id));
        return next;
      });
      setAnimatingEdges((prev) => {
        const next = new Set(prev);
        allLinkedEdgeIds.forEach((id) => next.delete(id));
        return next;
      });

      // Remove PolicyNode from waiting state
      setWaitingForDecision((prev) => {
        const next = new Set(prev);
        next.delete(parentPolicyId);
        return next;
      });

      // Mark PolicyNode as executed
      setExecutedNodes((prev) => new Set([...prev, parentPolicyId]));

      // Find the edge from the chosen PolicyOutputNode
      const chosenEdge = edges.find((e) => e.source === outputNode.id);

      if (chosenEdge) {
        const targetNode = nodes.find((n) => n.id === chosenEdge.target);
        const isTargetTrigger = targetNode?.type === 'trigger';

        // Start animation on the edge
        setAnimatingEdges((prev) => new Set([...prev, chosenEdge.id]));

        // Schedule animation end
        const timeoutId = window.setTimeout(() => {
          setAnimatingEdges((prev) => {
            const next = new Set(prev);
            next.delete(chosenEdge.id);
            return next;
          });
          setExecutedEdges((prev) => new Set([...prev, chosenEdge.id]));

          // Execute next node UNLESS it's a trigger
          if (!isTargetTrigger) {
            handleExecuteNode(chosenEdge.target);
          }
        }, SIMULATION_DELAY);
        simulationTimeouts.current.push(timeoutId);
      }
    },
    [edges, nodes, handleExecuteNode, getLinkedNodes]
  );

  // Handle trigger (with linked nodes reset)
  const handleTrigger = useCallback(
    (triggerId: string) => {
      resetLinkedNodes(triggerId);
      handleExecuteNode(triggerId);
    },
    [resetLinkedNodes, handleExecuteNode]
  );

  // Start simulation from a PolicyOutputNode
  const handleTriggerFromOutput = useCallback(
    (outputNodeId: string) => {
      resetLinkedNodes(outputNodeId);
      setTriggeredOutputNodes((prev) => new Set([...prev, outputNodeId]));
      handleExecuteNode(outputNodeId);
    },
    [resetLinkedNodes, handleExecuteNode]
  );

  // Reset simulation
  const handleResetSimulation = useCallback(() => {
    simulationTimeouts.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    simulationTimeouts.current = [];

    setExecutedNodes(new Set());
    setActiveNodes(new Set());
    setExecutedEdges(new Set());
    setAnimatingEdges(new Set());
    setWaitingForDecision(new Set());
    setTriggeredOutputNodes(new Set());
  }, []);

  // Check if simulation is active
  const isSimulationActive =
    executedNodes.size > 0 ||
    activeNodes.size > 0 ||
    animatingEdges.size > 0 ||
    waitingForDecision.size > 0;

  return {
    // State
    executedNodes,
    activeNodes,
    executedEdges,
    animatingEdges,
    waitingForDecision,
    triggeredOutputNodes,

    // State setters
    setExecutedEdges,
    setAnimatingEdges,

    // Functions
    getLinkedNodes,
    resetLinkedNodes,
    handleExecuteNode,
    handlePolicyDecision,
    handleTrigger,
    handleTriggerFromOutput,
    handleResetSimulation,

    // Helpers
    isSimulationActive,
  };
}
