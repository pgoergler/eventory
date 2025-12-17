import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import ReactFlow, {
    addEdge,
    Background,
    BackgroundVariant,
    type Connection,
    ConnectionMode,
    Controls,
    type Edge,
    MiniMap,
    type Node,
    type NodeChange,
    type NodePositionChange,
    type OnSelectionChangeParams,
    type ReactFlowInstance,
    reconnectEdge,
    useEdgesState,
    useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {nodeTypes} from './nodes';
import {edgeTypes, FloatingConnectionLine} from './edges';
import {Sidebar} from './Sidebar';
import {DebugPanel} from './DebugPanel';
import {useWorkflowStorage} from '../hooks/useWorkflowStorage';
import type {PolicyNodeData, PolicyOutput, PolicyOutputNodeData, WorkflowNodeData} from '../types/workflow';
import {
    GRID_SIZE,
    EXECUTED_GREEN,
    SIMULATION_DELAY,
    POLICY_OUTPUT_OFFSET_X,
    POLICY_OUTPUT_SPACING_Y,
    MAX_GAP,
    PASTE_OFFSET,
} from '../constants/workflow';
import { useSimulation } from '../hooks/useSimulation';

let nodeId = 0;
const getNodeId = () => `node_${nodeId++}`;

const initialNodes: Node<WorkflowNodeData>[] = [];

export function WorkflowCanvas() {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
    const connectingFrom = useRef<{ nodeId: string; handleId: string | null } | null>(null);
    const clipboard = useRef<Node<WorkflowNodeData>[]>([]);
    const edgeReconnectSuccessful = useRef(true);
    const {saveWorkflow, loadWorkflow, clearWorkflow} = useWorkflowStorage();

    // Simulation state and functions
    const {
        executedNodes,
        activeNodes,
        executedEdges,
        animatingEdges,
        waitingForDecision,
        triggeredOutputNodes,
        handleExecuteNode,
        handlePolicyDecision,
        handleTrigger,
        handleTriggerFromOutput,
        handleResetSimulation,
        isSimulationActive,
    } = useSimulation({ nodes, edges });

    // État pour le survol des edges
    const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

    // État pour la sélection (debug panel)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

    // Fonction de nettoyage du workflow
    const cleanupWorkflow = useCallback((workflowNodes: Node[], workflowEdges: Edge[]): { nodes: Node[]; edges: Edge[] } => {
        const nodeIds = new Set(workflowNodes.map(n => n.id));
        const VALID_HANDLES = ['top', 'bottom', 'left', 'right', 'output'];

        // Filtrer les edges orphelins et en double
        const filteredEdges = workflowEdges.filter((edge, index, self) => {
            // Vérifier que source et target existent
            const sourceExists = nodeIds.has(edge.source);
            const targetExists = nodeIds.has(edge.target);

            if (!sourceExists || !targetExists) {
                console.log(`[Cleanup] Suppression edge orphelin: ${edge.id} (source: ${edge.source} exists: ${sourceExists}, target: ${edge.target} exists: ${targetExists})`);
                return false;
            }

            // Vérifier les doublons (même source et même target)
            const isDuplicate = self.findIndex(e =>
                e.source === edge.source && e.target === edge.target
            ) !== index;

            if (isDuplicate) {
                console.log(`[Cleanup] Suppression edge en double: ${edge.id} (${edge.source} → ${edge.target})`);
                return false;
            }

            return true;
        });

        // Corriger les handles invalides et s'assurer que le type est 'floating'
        const cleanedEdges = filteredEdges.map(edge => {
            let { sourceHandle, targetHandle, type } = edge;
            let modified = false;

            // S'assurer que le type est 'floating'
            if (type !== 'floating') {
                if (type) {
                    console.log(`[Cleanup] Correction type: ${type} → floating (edge: ${edge.id})`);
                } else {
                    console.log(`[Cleanup] Ajout type: floating (edge: ${edge.id})`);
                }
                type = 'floating';
                modified = true;
            }

            // Corriger sourceHandle si invalide
            if (sourceHandle && !VALID_HANDLES.includes(sourceHandle)) {
                const base = sourceHandle.split('-')[0];
                if (VALID_HANDLES.includes(base)) {
                    console.log(`[Cleanup] Correction sourceHandle: ${sourceHandle} → ${base} (edge: ${edge.id})`);
                    sourceHandle = base;
                    modified = true;
                } else {
                    console.log(`[Cleanup] sourceHandle inconnu supprimé: ${sourceHandle} (edge: ${edge.id})`);
                    sourceHandle = undefined;
                    modified = true;
                }
            }

            // Corriger targetHandle si invalide
            if (targetHandle && !VALID_HANDLES.includes(targetHandle)) {
                const base = targetHandle.split('-')[0];
                if (VALID_HANDLES.includes(base)) {
                    console.log(`[Cleanup] Correction targetHandle: ${targetHandle} → ${base} (edge: ${edge.id})`);
                    targetHandle = base;
                    modified = true;
                } else {
                    console.log(`[Cleanup] targetHandle inconnu supprimé: ${targetHandle} (edge: ${edge.id})`);
                    targetHandle = undefined;
                    modified = true;
                }
            }

            if (modified) {
                return { ...edge, sourceHandle, targetHandle, type };
            }
            return edge;
        });

        const removedCount = workflowEdges.length - filteredEdges.length;
        if (removedCount > 0) {
            console.log(`[Cleanup] ${removedCount} edge(s) supprimé(s)`);
        }

        return { nodes: workflowNodes, edges: cleanedEdges };
    }, []);

    // Charger le workflow au démarrage
    useEffect(() => {
        const saved = loadWorkflow();
        if (saved) {
            // Nettoyer le workflow avant de le charger
            const cleaned = cleanupWorkflow(saved.nodes as Node<WorkflowNodeData>[], saved.edges);
            setNodes(cleaned.nodes as Node<WorkflowNodeData>[]);
            setEdges(cleaned.edges);
            // Mettre à jour le compteur d'ID
            const maxId = saved.nodes.reduce((max, node) => {
                const id = parseInt(node.id.replace('node_', ''), 10);
                return isNaN(id) ? max : Math.max(max, id);
            }, 0);
            nodeId = maxId + 1;
        }
    }, [loadWorkflow, setNodes, setEdges, cleanupWorkflow]);

    // Sauvegarder à chaque changement
    useEffect(() => {
        saveWorkflow(nodes, edges);
    }, [nodes, edges, saveWorkflow]);

    // Ref pour stocker la position précédente des PolicyNodes en cours de déplacement
    const policyDragStart = useRef<Map<string, { x: number; y: number }>>(new Map());

    // Wrapper pour onNodesChange qui gère le déplacement groupé des PolicyNodes
    const handleNodesChange = useCallback(
        (changes: NodeChange[]) => {
            const additionalChanges: NodeChange[] = [];

            for (const change of changes) {
                if (change.type === 'position' && change.dragging) {
                    const posChange = change as NodePositionChange;
                    const node = nodes.find(n => n.id === posChange.id);

                    if (node?.type === 'policy' && posChange.position) {
                        // Un PolicyNode est en train d'être déplacé
                        const policyData = node.data as PolicyNodeData;
                        const outputNodeIds = policyData.outputNodeIds || [];

                        // Calculer le delta de déplacement
                        const previousPos = policyDragStart.current.get(node.id) || node.position;
                        const deltaX = posChange.position.x - previousPos.x;
                        const deltaY = posChange.position.y - previousPos.y;

                        // Mettre à jour la position de référence
                        policyDragStart.current.set(node.id, posChange.position);

                        // Créer des changements pour tous les nœuds enfants
                        for (const outputNodeId of outputNodeIds) {
                            const outputNode = nodes.find(n => n.id === outputNodeId);
                            if (outputNode) {
                                additionalChanges.push({
                                    type: 'position',
                                    id: outputNodeId,
                                    position: {
                                        x: outputNode.position.x + deltaX,
                                        y: outputNode.position.y + deltaY,
                                    },
                                    dragging: true,
                                } as NodePositionChange);
                            }
                        }
                    } else if (node?.type === 'policyOutput' && posChange.position) {
                        // Un PolicyOutputNode est déplacé - contraindre l'espacement et mettre à jour la position relative
                        const outputData = node.data as PolicyOutputNodeData;
                        const parentPolicy = nodes.find(n => n.id === outputData.parentPolicyId);

                        if (parentPolicy) {
                            // Calculer les bords du parent
                            const parentLeft = parentPolicy.position.x;
                            const parentRight = parentPolicy.position.x + (parentPolicy.width ?? 160);
                            const parentTop = parentPolicy.position.y;
                            const parentBottom = parentPolicy.position.y + (parentPolicy.height ?? 80);
                            const parentCenterX = (parentLeft + parentRight) / 2;
                            const parentCenterY = (parentTop + parentBottom) / 2;

                            // Calculer les dimensions du nœud secondaire
                            const outputW = node.width ?? 80;
                            const outputH = node.height ?? 40;

                            let newX = posChange.position.x;
                            let newY = posChange.position.y;

                            // Déterminer de quel côté est le secondaire par rapport au parent
                            const outputCenterX = newX + outputW / 2;
                            const outputCenterY = newY + outputH / 2;

                            const nodeLeft = posChange.position.x;
                            const nodeTop = posChange.position.y;

                            if (newX < parentLeft) {
                                newX = parentLeft - outputW - MAX_GAP;
                                newY = Math.min(Math.max(nodeTop, parentTop - outputH - MAX_GAP), parentBottom + MAX_GAP);
                            } else if (newX > parentRight) {
                                newX = parentRight + MAX_GAP;
                                newY = Math.min(Math.max(nodeTop, parentTop - outputH - MAX_GAP), parentBottom + MAX_GAP);
                            } else if (newY < parentTop) {
                                newX = Math.min(Math.max(nodeLeft, parentLeft - outputW - MAX_GAP), parentRight + MAX_GAP);
                                newY = parentTop - outputH - MAX_GAP;
                            } else if (newY > parentBottom) {
                                newX = Math.min(Math.max(nodeLeft, parentLeft - outputW - MAX_GAP), parentRight + MAX_GAP);
                                newY = parentBottom + MAX_GAP;
                            } else {
                                if (outputCenterX > parentCenterX) {
                                    newX = parentRight + MAX_GAP;
                                } else {
                                    newX = parentLeft - outputW - MAX_GAP;
                                }

                                if (outputCenterY > parentCenterY) {
                                    newY = parentBottom + MAX_GAP;
                                } else {
                                    newY = parentTop - outputH - MAX_GAP;
                                }
                            }

                            // Appliquer la position contrainte
                            posChange.position = {x: newX, y: newY};

                            // Calculer la nouvelle position relative
                            const newRelativePosition = {
                                x: newX - parentPolicy.position.x,
                                y: newY - parentPolicy.position.y,
                            };

                            // Mettre à jour les données du nœud avec la nouvelle position relative
                            setNodes(nds => nds.map(n => {
                                if (n.id === posChange.id) {
                                    return {
                                        ...n,
                                        data: {
                                            ...n.data,
                                            relativePosition: newRelativePosition,
                                        },
                                    };
                                }
                                return n;
                            }));
                        }
                    }
                } else if (change.type === 'position' && !change.dragging) {
                    // Fin du drag - nettoyer la ref
                    policyDragStart.current.delete(change.id);
                }
            }

            // Gérer la suppression en cascade des PolicyOutputNodes quand un PolicyNode est supprimé
            const removeChanges = changes.filter(c => c.type === 'remove');
            if (removeChanges.length > 0) {
                const nodeIdsToRemove = new Set(removeChanges.map(c => c.id));

                // Trouver les PolicyNodes supprimés
                for (const change of removeChanges) {
                    const node = nodes.find(n => n.id === change.id);
                    if (node?.type === 'policy') {
                        const policyData = node.data as PolicyNodeData;
                        const outputNodeIds = policyData.outputNodeIds || [];

                        // Ajouter les PolicyOutputNodes à supprimer
                        for (const outputNodeId of outputNodeIds) {
                            if (!nodeIdsToRemove.has(outputNodeId)) {
                                additionalChanges.push({
                                    type: 'remove',
                                    id: outputNodeId,
                                });
                            }
                        }
                    }
                }
            }

            // Appliquer tous les changements
            onNodesChange([...changes, ...additionalChanges]);
        },
        [nodes, onNodesChange, setNodes]
    );

    // Mettre à jour le label d'un nœud
    const handleLabelChange = useCallback(
        (nodeId: string, newLabel: string) => {
            setNodes((nds) =>
                nds.map((node) =>
                    node.id === nodeId
                        ? {...node, data: {...node.data, label: newLabel}}
                        : node
                )
            );
        },
        [setNodes]
    );

    // Mettre à jour les sorties d'un PolicyNode et créer/supprimer les PolicyOutputNodes
    const handleOutputsChange = useCallback(
        (policyNodeId: string, newOutputs: PolicyOutput[]) => {
            const policyNode = nodes.find(n => n.id === policyNodeId);
            if (!policyNode || policyNode.type !== 'policy') return;

            const policyData = policyNode.data as PolicyNodeData;
            const existingOutputIds = policyData.outputs.map(o => o.id);
            const newOutputIds = newOutputs.map(o => o.id);
            const existingOutputNodeIds = policyData.outputNodeIds || [];

            // Trouver les sorties ajoutées et supprimées
            const addedOutputs = newOutputs.filter(o => !existingOutputIds.includes(o.id));
            const removedOutputIds = existingOutputIds.filter(id => !newOutputIds.includes(id));

            // Trouver les PolicyOutputNodes à supprimer
            const outputNodesToRemove = nodes.filter(
                n => n.type === 'policyOutput' &&
                    (n.data as PolicyOutputNodeData).parentPolicyId === policyNodeId &&
                    removedOutputIds.includes((n.data as PolicyOutputNodeData).outputId)
            );
            const nodeIdsToRemove = new Set(outputNodesToRemove.map(n => n.id));

            // Créer les nouveaux PolicyOutputNodes
            const newOutputNodes: Node<PolicyOutputNodeData>[] = addedOutputs.map((output, index) => {
                const outputNodeId = getNodeId();
                const yOffset = (existingOutputNodeIds.length - nodeIdsToRemove.size + index) * POLICY_OUTPUT_SPACING_Y;
                const relativeX = POLICY_OUTPUT_OFFSET_X;
                const relativeY = yOffset - ((newOutputs.length - 1) * POLICY_OUTPUT_SPACING_Y) / 2;

                return {
                    id: outputNodeId,
                    type: 'policyOutput',
                    position: {
                        x: policyNode.position.x + relativeX,
                        y: policyNode.position.y + relativeY,
                    },
                    data: {
                        label: output.label,
                        parentPolicyId: policyNodeId,
                        outputId: output.id,
                        relativePosition: {x: relativeX, y: relativeY},
                    },
                };
            });

            // Mettre à jour les labels des PolicyOutputNodes existants
            const updatedNodes = nodes
                .filter(n => !nodeIdsToRemove.has(n.id))
                .map(n => {
                    if (n.id === policyNodeId) {
                        // Mettre à jour le PolicyNode principal
                        const newOutputNodeIds = existingOutputNodeIds
                            .filter(id => !nodeIdsToRemove.has(id))
                            .concat(newOutputNodes.map(on => on.id));

                        return {
                            ...n,
                            data: {
                                ...n.data,
                                outputs: newOutputs,
                                outputNodeIds: newOutputNodeIds,
                            },
                        };
                    }
                    if (n.type === 'policyOutput' && (n.data as PolicyOutputNodeData).parentPolicyId === policyNodeId) {
                        // Mettre à jour le label du PolicyOutputNode si nécessaire
                        const outputData = n.data as PolicyOutputNodeData;
                        const matchingOutput = newOutputs.find(o => o.id === outputData.outputId);
                        if (matchingOutput && matchingOutput.label !== outputData.label) {
                            return {
                                ...n,
                                data: {
                                    ...n.data,
                                    label: matchingOutput.label,
                                },
                            };
                        }
                    }
                    return n;
                });

            // Appliquer les changements
            setNodes([...updatedNodes, ...newOutputNodes]);

            // Supprimer les edges connectés aux nœuds supprimés
            if (nodeIdsToRemove.size > 0) {
                setEdges(eds => eds.filter(e =>
                    !nodeIdsToRemove.has(e.source) && !nodeIdsToRemove.has(e.target)
                ));
            }
        },
        [nodes, setNodes, setEdges]
    );

    // Trouver les nœuds connectés à l'edge survolé
    const hoveredEdgeNodes = useMemo(() => {
        if (!hoveredEdge) return new Set<string>();
        const edge = edges.find((e) => e.id === hoveredEdge);
        if (!edge) return new Set<string>();
        return new Set([edge.source, edge.target]);
    }, [hoveredEdge, edges]);

    // Calculer les PolicyOutputNodes connectés (qui ont un edge sortant)
    const connectedOutputNodes = useMemo(() => {
        const connected = new Set<string>();
        edges.forEach((edge) => {
            const sourceNode = nodes.find((n) => n.id === edge.source);
            if (sourceNode?.type === 'policyOutput') {
                connected.add(edge.source);
            }
        });
        return connected;
    }, [edges, nodes]);

    // Nœuds enrichis avec état de simulation et callbacks
    const nodesWithSimulation = useMemo(() => {
        return nodes.map((node) => {
            const baseData = {
                ...node.data,
                isExecuted: executedNodes.has(node.id),
                isActive: activeNodes.has(node.id),
                isEdgeHovered: hoveredEdgeNodes.has(node.id),
                onLabelChange: handleLabelChange,
            };

            // Enrichissement spécifique pour PolicyOutputNode
            if (node.type === 'policyOutput') {
                const outputData = node.data as PolicyOutputNodeData;
                return {
                    ...node,
                    data: {
                        ...baseData,
                        isWaitingForDecision: waitingForDecision.has(outputData.parentPolicyId),
                        isConnected: connectedOutputNodes.has(node.id),
                        isTriggered: triggeredOutputNodes.has(node.id),
                        onOutputDecision: handlePolicyDecision,
                        onTriggerFromOutput: handleTriggerFromOutput,
                    },
                };
            }

            // Enrichissement spécifique pour PolicyNode
            if (node.type === 'policy') {
                return {
                    ...node,
                    data: {
                        ...baseData,
                        isWaitingForDecision: waitingForDecision.has(node.id),
                        onOutputsChange: handleOutputsChange,
                    },
                };
            }

            // Autres types de nœuds (step, trigger)
            return {
                ...node,
                data: {
                    ...baseData,
                    onExecute: handleExecuteNode,
                    onTrigger: handleTrigger,
                },
            };
        });
    }, [nodes, executedNodes, activeNodes, hoveredEdgeNodes, waitingForDecision, connectedOutputNodes, triggeredOutputNodes, handleExecuteNode, handleTrigger, handleTriggerFromOutput, handleLabelChange, handlePolicyDecision, handleOutputsChange]);

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
            if (!params.source || !params.target) return;
            setEdges((eds) => {
                // Vérifier si un edge existe déjà entre ces deux noeuds
                const exists = eds.some(e => e.source === params.source && e.target === params.target);
                if (exists) return eds;
                return addEdge({...params, type: 'floating'}, eds);
            });
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
        (_: unknown, {nodeId, handleId}: { nodeId: string | null; handleId: string | null }) => {
            if (nodeId) {
                connectingFrom.current = {nodeId, handleId};
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
                // Créer un edge vers le nœud cible (si pas déjà existant)
                const sourceId = connectingFrom.current.nodeId;
                const targetId = targetNode.id;
                setEdges((eds) => {
                    // Vérifier si un edge existe déjà entre ces deux noeuds
                    const exists = eds.some(e => e.source === sourceId && e.target === targetId);
                    if (exists) return eds;
                    const newEdge = {
                        id: `edge_${sourceId}_${targetId}_${Date.now()}`,
                        source: sourceId,
                        sourceHandle: connectingFrom.current?.handleId,
                        target: targetId,
                        type: 'floating',
                    };
                    return addEdge(newEdge, eds);
                });
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
                    data: {label: `Event ${nodeId}`},
                };

                // Créer l'edge qui connecte le nœud source au nouveau nœud
                const newEdge = {
                    id: `edge_${connectingFrom.current.nodeId}_${newNodeId}`,
                    source: connectingFrom.current.nodeId,
                    sourceHandle: connectingFrom.current.handleId,
                    target: newNodeId,
                    type: 'floating',
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
                    {id: 'output_yes', label: 'Oui', position: 'right'},
                    {id: 'output_no', label: 'Non', position: 'right'},
                ],
                outputNodeIds: [],
            } as PolicyNodeData;
        }
        return {label: `Étape ${id}`};
    }, []);

    // Créer un PolicyNode avec ses PolicyOutputNodes enfants
    const createPolicyWithOutputs = useCallback((position: { x: number; y: number }): Node<WorkflowNodeData>[] => {
        const policyId = getNodeId();
        const outputs: PolicyOutput[] = [
            {id: 'output_yes', label: 'Oui', position: 'right'},
            {id: 'output_no', label: 'Non', position: 'right'},
        ];

        // Calculer les positions des nœuds de sortie
        const startY = position.y - ((outputs.length - 1) * POLICY_OUTPUT_SPACING_Y) / 2;

        const outputNodes: Node<PolicyOutputNodeData>[] = outputs.map((output, index) => {
            const outputNodeId = getNodeId();
            const relativeX = POLICY_OUTPUT_OFFSET_X;
            const relativeY = (index * POLICY_OUTPUT_SPACING_Y) - ((outputs.length - 1) * POLICY_OUTPUT_SPACING_Y) / 2;

            return {
                id: outputNodeId,
                type: 'policyOutput',
                position: {
                    x: position.x + relativeX,
                    y: startY + index * POLICY_OUTPUT_SPACING_Y,
                },
                data: {
                    label: output.label,
                    parentPolicyId: policyId,
                    outputId: output.id,
                    relativePosition: {x: relativeX, y: relativeY},
                },
            };
        });

        const policyNode: Node<PolicyNodeData> = {
            id: policyId,
            type: 'policy',
            position,
            data: {
                label: `Policy ${nodeId}`,
                outputs,
                outputNodeIds: outputNodes.map(n => n.id),
            },
        };

        return [policyNode, ...outputNodes];
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

            // Cas spécial pour policy : créer le nœud principal + les nœuds de sortie
            if (type === 'policy') {
                const newNodes = createPolicyWithOutputs(position);
                setNodes((nds) => [...nds, ...newNodes]);
                return;
            }

            const newNode: Node<WorkflowNodeData> = {
                id: getNodeId(),
                type,
                position,
                data: getDefaultNodeData(type, nodeId),
            };

            setNodes((nds) => [...nds, newNode]);
        },
        [setNodes, getDefaultNodeData, createPolicyWithOutputs]
    );

    const addNode = useCallback(
        (type: string) => {
            const position = {
                x: Math.random() * 400 + 100,
                y: Math.random() * 300 + 100,
            };

            // Cas spécial pour policy : créer le nœud principal + les nœuds de sortie
            if (type === 'policy') {
                const newNodes = createPolicyWithOutputs(position);
                setNodes((nds) => [...nds, ...newNodes]);
                return;
            }

            const newNode: Node<WorkflowNodeData> = {
                id: getNodeId(),
                type,
                position,
                data: getDefaultNodeData(type, nodeId),
            };

            setNodes((nds) => [...nds, newNode]);
        },
        [setNodes, getDefaultNodeData, createPolicyWithOutputs]
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
                data: {...node.data},
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
                data: {...node.data},
                selected: true,
            };
        });

        // Mettre à jour le clipboard pour le prochain collage
        clipboard.current = newNodes.map((node) => ({
            ...node,
            data: {...node.data},
        }));

        // Désélectionner les anciens nœuds et ajouter les nouveaux
        setNodes((nds) => [
            ...nds.map((n) => ({...n, selected: false})),
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
            nodes: nodes.map(({id, type, position, data}) => ({
                id,
                type,
                position,
                data,
            })),
            edges: edges.map(({id, source, sourceHandle, target, targetHandle}) => ({
                id,
                source,
                sourceHandle,
                target,
                targetHandle,
            })),
        };

        const json = JSON.stringify(workflow, null, 2);
        const blob = new Blob([json], {type: 'application/json'});
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
                        // Nettoyer le workflow avant de l'importer
                        const cleaned = cleanupWorkflow(workflow.nodes as Node<WorkflowNodeData>[], workflow.edges);
                        setNodes(cleaned.nodes as Node<WorkflowNodeData>[]);
                        setEdges(cleaned.edges);

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
        [setNodes, setEdges, cleanupWorkflow]
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

    // Callbacks pour le DebugPanel
    const handleSelectNode = useCallback((nodeId: string) => {
        setSelectedNodeId(nodeId);
        setSelectedEdgeId(null);
        // Sélectionner le noeud dans ReactFlow
        setNodes(nds => nds.map(n => ({
            ...n,
            selected: n.id === nodeId
        })));
        // Centrer la vue sur le noeud
        const node = nodes.find(n => n.id === nodeId);
        if (node && reactFlowInstance.current) {
            reactFlowInstance.current.setCenter(
                node.position.x + (node.width ?? 100) / 2,
                node.position.y + (node.height ?? 50) / 2,
                { zoom: 1, duration: 500 }
            );
        }
    }, [nodes, setNodes]);

    const handleSelectEdge = useCallback((edgeId: string) => {
        setSelectedEdgeId(edgeId);
        setSelectedNodeId(null);
        // Sélectionner l'edge dans ReactFlow
        setEdges(eds => eds.map(e => ({
            ...e,
            selected: e.id === edgeId
        })));
        // Désélectionner tous les noeuds
        setNodes(nds => nds.map(n => ({
            ...n,
            selected: false
        })));
    }, [setEdges, setNodes]);

    // Synchroniser la sélection du canvas vers le DebugPanel
    const onSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
        // Si un noeud est sélectionné, mettre à jour selectedNodeId
        if (selectedNodes.length > 0) {
            setSelectedNodeId(selectedNodes[0].id);
            setSelectedEdgeId(null);
        }
        // Si un edge est sélectionné (et pas de noeud), mettre à jour selectedEdgeId
        else if (selectedEdges.length > 0) {
            setSelectedEdgeId(selectedEdges[0].id);
            setSelectedNodeId(null);
        }
        // Si rien n'est sélectionné, tout réinitialiser
        else {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
        }
    }, []);

    return (
        <div className="workflow-container">
            <Sidebar
                onAddNode={addNode}
                onClear={handleClear}
                onExport={handleExport}
                onImport={handleImport}
                onResetSimulation={handleResetSimulation}
                isSimulationActive={isSimulationActive}
            />

            <div className="canvas-wrapper" ref={reactFlowWrapper}>
                <ReactFlow
                    nodes={nodesWithSimulation}
                    edges={edgesWithSimulation}
                    onNodesChange={handleNodesChange}
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
                    onSelectionChange={onSelectionChange}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    connectionLineComponent={FloatingConnectionLine}
                    defaultEdgeOptions={{
                        type: 'floating',
                        animated: true,
                        style: {stroke: '#FF8C00', strokeWidth: 2},
                    }}
                    snapToGrid={true}
                    snapGrid={[GRID_SIZE, GRID_SIZE]}
                    connectionMode={ConnectionMode.Loose}
                    fitView
                    deleteKeyCode={['Backspace', 'Delete']}
                >
                    <Controls/>
                    <MiniMap zoomable pannable/>
                    <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1}/>
                </ReactFlow>
            </div>

            <DebugPanel
                nodes={nodes}
                edges={edges}
                executedNodes={executedNodes}
                activeNodes={activeNodes}
                waitingForDecision={waitingForDecision}
                executedEdges={executedEdges}
                animatingEdges={animatingEdges}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                onSelectNode={handleSelectNode}
                onSelectEdge={handleSelectEdge}
            />
        </div>
    );
}
