import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  type Connection,
  type ReactFlowInstance,
  type Node,
  type Edge,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

const GRID_SIZE = 20;
const EXECUTED_GREEN = '#22c55e';
const SIMULATION_DELAY = 1000; // 1 secondes de délai entre chaque étape

import { nodeTypes } from './nodes';
import { edgeTypes, FloatingConnectionLine } from './edges';
import { Sidebar } from './Sidebar';
import { useWorkflowStorage } from '../hooks/useWorkflowStorage';
import type { WorkflowNodeData, PolicyNodeData, PolicyOutput } from '../types/workflow';

let nodeId = 0;
const getNodeId = () => `node_${nodeId++}`;

const initialNodes: Node<WorkflowNodeData>[] = [];

const PASTE_OFFSET = 40; // Décalage lors du collage

export function WorkflowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const connectingFrom = useRef<{ nodeId: string; handleId: string | null } | null>(null);
  const clipboard = useRef<Node<WorkflowNodeData>[]>([]);
  const edgeReconnectSuccessful = useRef(true);
  const { saveWorkflow, loadWorkflow, clearWorkflow } = useWorkflowStorage();

  // État de simulation
  const [executedNodes, setExecutedNodes] = useState<Set<string>>(new Set());
  const [activeNodes, setActiveNodes] = useState<Set<string>>(new Set());
  const [executedEdges, setExecutedEdges] = useState<Set<string>>(new Set());
  const [animatingEdges, setAnimatingEdges] = useState<Set<string>>(new Set());
  const [waitingForDecision, setWaitingForDecision] = useState<Set<string>>(new Set());
  const simulationTimeouts = useRef<number[]>([]);

  // État pour le survol des edges
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  // Charger le workflow au démarrage
  useEffect(() => {
    const saved = loadWorkflow();
    if (saved) {
      setNodes(saved.nodes as Node<WorkflowNodeData>[]);
      setEdges(saved.edges);
      // Mettre à jour le compteur d'ID
      const maxId = saved.nodes.reduce((max, node) => {
        const id = parseInt(node.id.replace('node_', ''), 10);
        return isNaN(id) ? max : Math.max(max, id);
      }, 0);
      nodeId = maxId + 1;
    }
  }, [loadWorkflow, setNodes, setEdges]);

  // Sauvegarder à chaque changement
  useEffect(() => {
    saveWorkflow(nodes, edges);
  }, [nodes, edges, saveWorkflow]);

  // Trouver tous les nœuds liés à un nœud source (en suivant les edges)
  const getLinkedNodes = useCallback(
    (sourceNodeId: string): Set<string> => {
      const linkedNodes = new Set<string>();
      const visited = new Set<string>();
      const queue = [sourceNodeId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        // Trouver les nœuds connectés via les edges sortants
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

  // Réinitialiser les nœuds liés à un trigger
  const resetLinkedNodes = useCallback(
    (triggerNodeId: string) => {
      const linkedNodes = getLinkedNodes(triggerNodeId);

      // Annuler les timeouts en cours
      simulationTimeouts.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      simulationTimeouts.current = [];

      // Retirer les nœuds liés des états de simulation
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

      // Retirer les edges liés
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

  // Exécuter un nœud (simulation)
  const handleExecuteNode = useCallback(
    (nodeIdToExecute: string) => {
      const nodeToExecute = nodes.find((n) => n.id === nodeIdToExecute);

      // Vérifier si c'est un nœud policy - il doit attendre une décision manuelle
      if (nodeToExecute?.type === 'policy') {
        setWaitingForDecision((prev) => new Set([...prev, nodeIdToExecute]));
        return; // Ne pas continuer automatiquement
      }

      // Marquer le nœud comme exécuté
      setExecutedNodes((prev) => new Set([...prev, nodeIdToExecute]));
      setActiveNodes((prev) => {
        const next = new Set(prev);
        next.delete(nodeIdToExecute);
        return next;
      });

      // Trouver tous les edges sortants
      const outgoingEdges = edges.filter((e) => e.source === nodeIdToExecute);

      if (outgoingEdges.length > 0) {
        // Démarrer l'animation sur TOUS les edges sortants
        const outgoingEdgeIds = outgoingEdges.map((e) => e.id);
        setAnimatingEdges((prev) => new Set([...prev, ...outgoingEdgeIds]));

        // Programmer la fin de l'animation pour chaque edge
        outgoingEdges.forEach((edge) => {
          const targetNode = nodes.find((n) => n.id === edge.target);
          const isTargetTrigger = targetNode?.type === 'trigger';

          const timeoutId = window.setTimeout(() => {
            // Marquer l'edge comme exécuté (fin de l'animation)
            setAnimatingEdges((prev) => {
              const next = new Set(prev);
              next.delete(edge.id);
              return next;
            });
            setExecutedEdges((prev) => new Set([...prev, edge.id]));

            // Exécuter le nœud suivant SAUF si c'est un trigger
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

  // Gérer la décision d'un nœud policy
  const handlePolicyDecision = useCallback(
    (nodeId: string, outputId: string) => {
      // Retirer de l'état d'attente
      setWaitingForDecision((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });

      // Marquer comme exécuté
      setExecutedNodes((prev) => new Set([...prev, nodeId]));

      // Trouver l'edge correspondant à la sortie choisie
      const chosenEdge = edges.find(
        (e) => e.source === nodeId && e.sourceHandle === outputId
      );
      if (chosenEdge) {
        const targetNode = nodes.find((n) => n.id === chosenEdge.target);
        const isTargetTrigger = targetNode?.type === 'trigger';

        // Démarrer l'animation sur l'edge
        setAnimatingEdges((prev) => new Set([...prev, chosenEdge.id]));

        // Programmer la fin de l'animation
        const timeoutId = window.setTimeout(() => {
          // Marquer l'edge comme exécuté
          setAnimatingEdges((prev) => {
            const next = new Set(prev);
            next.delete(chosenEdge.id);
            return next;
          });
          setExecutedEdges((prev) => new Set([...prev, chosenEdge.id]));

          // Exécuter le nœud suivant SAUF si c'est un trigger
          if (!isTargetTrigger) {
            handleExecuteNode(chosenEdge.target);
          }
        }, SIMULATION_DELAY);
        simulationTimeouts.current.push(timeoutId);
      }
    },
    [edges, nodes, handleExecuteNode]
  );

  // Gérer le déclenchement d'un trigger (avec reset des nœuds liés)
  const handleTrigger = useCallback(
    (triggerId: string) => {
      // D'abord réinitialiser les nœuds liés
      resetLinkedNodes(triggerId);

      // Puis exécuter le trigger
      handleExecuteNode(triggerId);
    },
    [resetLinkedNodes, handleExecuteNode]
  );

  // Reset de la simulation
  const handleResetSimulation = useCallback(() => {
    // Annuler tous les timeouts en cours
    simulationTimeouts.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    simulationTimeouts.current = [];

    setExecutedNodes(new Set());
    setActiveNodes(new Set());
    setExecutedEdges(new Set());
    setAnimatingEdges(new Set());
    setWaitingForDecision(new Set());
  }, []);

  // Mettre à jour le label d'un nœud
  const handleLabelChange = useCallback(
    (nodeId: string, newLabel: string) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, label: newLabel } }
            : node
        )
      );
    },
    [setNodes]
  );

  // Mettre à jour les sorties d'un nœud policy
  const handleOutputsChange = useCallback(
    (nodeId: string, outputs: PolicyOutput[]) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, outputs } }
            : node
        )
      );
    },
    [setNodes]
  );

  // Trouver les nœuds connectés à l'edge survolé
  const hoveredEdgeNodes = useMemo(() => {
    if (!hoveredEdge) return new Set<string>();
    const edge = edges.find((e) => e.id === hoveredEdge);
    if (!edge) return new Set<string>();
    return new Set([edge.source, edge.target]);
  }, [hoveredEdge, edges]);

  // Calculer les sorties connectées pour chaque nœud policy
  const policyConnectedOutputs = useMemo(() => {
    const connectedMap = new Map<string, Set<string>>();
    edges.forEach((edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (sourceNode?.type === 'policy' && edge.sourceHandle) {
        if (!connectedMap.has(edge.source)) {
          connectedMap.set(edge.source, new Set<string>());
        }
        connectedMap.get(edge.source)!.add(edge.sourceHandle);
      }
    });
    return connectedMap;
  }, [edges, nodes]);

  // Nœuds enrichis avec état de simulation et callbacks
  const nodesWithSimulation = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isExecuted: executedNodes.has(node.id),
        isActive: activeNodes.has(node.id),
        isEdgeHovered: hoveredEdgeNodes.has(node.id),
        isWaitingForDecision: waitingForDecision.has(node.id),
        connectedOutputs: node.type === 'policy' ? policyConnectedOutputs.get(node.id) : undefined,
        onExecute: handleExecuteNode,
        onTrigger: handleTrigger,
        onLabelChange: handleLabelChange,
        onPolicyDecision: handlePolicyDecision,
        onOutputsChange: handleOutputsChange,
      },
    }));
  }, [nodes, executedNodes, activeNodes, hoveredEdgeNodes, waitingForDecision, policyConnectedOutputs, handleExecuteNode, handleTrigger, handleLabelChange, handlePolicyDecision, handleOutputsChange]);

  // Edges enrichis avec style selon état (sélectionné, exécuté, animé)
  const edgesWithSimulation = useMemo(() => {
    return edges.map((edge) => {
      const isExecuted = executedEdges.has(edge.id);
      const isAnimating = animatingEdges.has(edge.id);
      const isSelected = edge.selected;

      let strokeColor = '#FF8C00'; // Orange par défaut
      if (isSelected) {
        strokeColor = '#fff'; // Blanc si sélectionné
      } else if (isExecuted) {
        strokeColor = EXECUTED_GREEN; // Vert si exécuté
      }

      return {
        ...edge,
        type: 'floating',
        animated: !isExecuted && !isSelected && !isAnimating,
        interactionWidth: 20, // Zone de détection élargie
        reconnectable: true,
        data: {
          ...edge.data,
          isExecuted,
          isAnimating,
          animationDuration: SIMULATION_DELAY,
        },
        style: {
          stroke: strokeColor,
          strokeWidth: isSelected ? 3 : 2,
        },
      };
    });
  }, [edges, executedEdges, animatingEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

  // Gestion de la reconnexion des edges
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
    },
    [setEdges]
  );

  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        // Si la reconnexion a échoué (lâché dans le vide), supprimer l'edge
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }
      edgeReconnectSuccessful.current = true;
    },
    [setEdges]
  );

  const onConnectStart = useCallback(
    (_: unknown, { nodeId, handleId }: { nodeId: string | null; handleId: string | null }) => {
      if (nodeId) {
        connectingFrom.current = { nodeId, handleId };
      }
    },
    []
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!connectingFrom.current || !reactFlowInstance.current) {
        return;
      }

      const target = event.target as Element;
      const targetIsPane = target.classList.contains('react-flow__pane');

      // Obtenir la position du curseur
      const clientX = 'changedTouches' in event ? event.changedTouches[0].clientX : event.clientX;
      const clientY = 'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY;

      // Convertir les coordonnées écran en coordonnées du flow
      const flowPosition = reactFlowInstance.current.screenToFlowPosition({
        x: clientX,
        y: clientY,
      });

      // Chercher si on a lâché sur un nœud existant
      const targetNode = nodes.find((n) => {
        if (n.id === connectingFrom.current?.nodeId) return false; // Pas le même nœud
        const nodeX = n.position.x;
        const nodeY = n.position.y;
        const nodeW = n.width ?? 120;
        const nodeH = n.height ?? 80;
        return (
          flowPosition.x >= nodeX &&
          flowPosition.x <= nodeX + nodeW &&
          flowPosition.y >= nodeY &&
          flowPosition.y <= nodeY + nodeH
        );
      });

      if (targetNode) {
        // Créer un edge vers le nœud cible
        const newEdge = {
          id: `edge_${connectingFrom.current.nodeId}_${targetNode.id}_${Date.now()}`,
          source: connectingFrom.current.nodeId,
          sourceHandle: connectingFrom.current.handleId,
          target: targetNode.id,
        };
        setEdges((eds) => addEdge(newEdge, eds));
      } else if (targetIsPane) {
        // Snap to grid
        const position = {
          x: Math.round(flowPosition.x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(flowPosition.y / GRID_SIZE) * GRID_SIZE,
        };

        // Créer le nouveau nœud
        const newNodeId = getNodeId();
        const newNode: Node<WorkflowNodeData> = {
          id: newNodeId,
          type: 'step',
          position,
          data: { label: `Event ${nodeId}` },
        };

        // Créer l'edge qui connecte le nœud source au nouveau nœud
        const newEdge = {
          id: `edge_${connectingFrom.current.nodeId}_${newNodeId}`,
          source: connectingFrom.current.nodeId,
          sourceHandle: connectingFrom.current.handleId,
          target: newNodeId,
        };

        setNodes((nds) => [...nds, newNode]);
        setEdges((eds) => addEdge(newEdge, eds));
      }

      connectingFrom.current = null;
    },
    [nodes, setNodes, setEdges]
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
  }, []);

  // Gestion du survol des edges
  const onEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => {
    setHoveredEdge(edge.id);
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Créer les données par défaut selon le type de nœud
  const getDefaultNodeData = useCallback((type: string, id: number): WorkflowNodeData => {
    if (type === 'policy') {
      return {
        label: `Policy ${id}`,
        outputs: [
          { id: 'output_yes', label: 'Oui' },
          { id: 'output_no', label: 'Non' },
        ],
      } as PolicyNodeData;
    }
    return { label: `Étape ${id}` };
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowInstance.current || !reactFlowWrapper.current) {
        return;
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNode: Node<WorkflowNodeData> = {
        id: getNodeId(),
        type,
        position,
        data: getDefaultNodeData(type, nodeId),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes, getDefaultNodeData]
  );

  const addNode = useCallback(
    (type: string) => {
      const position = {
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 100,
      };

      const newNode: Node<WorkflowNodeData> = {
        id: getNodeId(),
        type,
        position,
        data: getDefaultNodeData(type, nodeId),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes, getDefaultNodeData]
  );

  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    clearWorkflow();
    nodeId = 0;
  }, [setNodes, setEdges, clearWorkflow]);

  // Copier les nœuds sélectionnés
  const handleCopy = useCallback(() => {
    const selectedNodes = nodes.filter((node) => node.selected);
    if (selectedNodes.length > 0) {
      clipboard.current = selectedNodes.map((node) => ({
        ...node,
        data: { ...node.data },
      }));
    }
  }, [nodes]);

  // Coller les nœuds copiés
  const handlePaste = useCallback(() => {
    if (clipboard.current.length === 0) return;

    const newNodes: Node<WorkflowNodeData>[] = clipboard.current.map((node) => {
      const newId = getNodeId();
      return {
        ...node,
        id: newId,
        position: {
          x: node.position.x + PASTE_OFFSET,
          y: node.position.y + PASTE_OFFSET,
        },
        data: { ...node.data },
        selected: true,
      };
    });

    // Mettre à jour le clipboard pour le prochain collage
    clipboard.current = newNodes.map((node) => ({
      ...node,
      data: { ...node.data },
    }));

    // Désélectionner les anciens nœuds et ajouter les nouveaux
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      ...newNodes,
    ]);
  }, [setNodes]);

  // Exporter le workflow en JSON
  const handleExport = useCallback(() => {
    // Générer le nom par défaut avec date et heure
    const now = new Date();
    const defaultName = `workflow-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // Demander le nom du fichier
    const fileName = prompt('Nom du fichier :', defaultName);
    if (!fileName) return; // Annulé

    const workflow = {
      nodes: nodes.map(({ id, type, position, data }) => ({
        id,
        type,
        position,
        data,
      })),
      edges: edges.map(({ id, source, sourceHandle, target, targetHandle }) => ({
        id,
        source,
        sourceHandle,
        target,
        targetHandle,
      })),
    };

    const json = JSON.stringify(workflow, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  // Importer un workflow depuis un fichier JSON
  const handleImport = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const workflow = JSON.parse(content);

          if (workflow.nodes && workflow.edges) {
            setNodes(workflow.nodes as Node<WorkflowNodeData>[]);
            setEdges(workflow.edges);

            // Mettre à jour le compteur d'ID
            const maxId = workflow.nodes.reduce((max: number, node: Node) => {
              const id = parseInt(node.id.replace('node_', ''), 10);
              return isNaN(id) ? max : Math.max(max, id);
            }, 0);
            nodeId = maxId + 1;
          }
        } catch (error) {
          console.error('Erreur lors de l\'import:', error);
          alert('Fichier JSON invalide');
        }
      };
      reader.readAsText(file);
    },
    [setNodes, setEdges]
  );

  // Écouter les raccourcis clavier
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignorer si on est dans un input
      if ((event.target as Element).tagName === 'INPUT') return;

      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        handleCopy();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
        handlePaste();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCopy, handlePaste]);

  return (
    <div className="workflow-container">
      <Sidebar
        onAddNode={addNode}
        onClear={handleClear}
        onExport={handleExport}
        onImport={handleImport}
        onResetSimulation={handleResetSimulation}
        isSimulationActive={executedNodes.size > 0 || activeNodes.size > 0 || animatingEdges.size > 0 || waitingForDecision.size > 0}
      />

      <div className="canvas-wrapper" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodesWithSimulation}
          edges={edgesWithSimulation}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onReconnectStart={onReconnectStart}
          onReconnect={onReconnect}
          onReconnectEnd={onReconnectEnd}
          onInit={onInit}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionLineComponent={FloatingConnectionLine}
          defaultEdgeOptions={{
            type: 'floating',
            animated: true,
            style: { stroke: '#FF8C00', strokeWidth: 2 },
          }}
          snapToGrid={true}
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          connectionMode={ConnectionMode.Loose}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Controls />
          <MiniMap zoomable pannable />
          <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
