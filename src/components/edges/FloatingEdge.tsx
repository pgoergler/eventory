import { useCallback, useState, useRef, useEffect } from 'react';
import { useStore, useReactFlow, getBezierPath, Position } from 'reactflow';
import type { EdgeProps, Node } from 'reactflow';
import { RECONNECT_HANDLE_RADIUS, EXECUTED_GREEN, BALL_RADIUS } from '../../constants/workflow';

// Positions des handles standards
const HANDLE_POSITIONS: Record<string, Position> = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
};

// Calcule la position d'un handle spécifique sur un nœud
function getHandlePosition(
  node: Node,
  handleId: string | null | undefined,
  fallbackNode?: Node
): { x: number; y: number; position: Position } {
  const nodeX = node.positionAbsolute?.x ?? 0;
  const nodeY = node.positionAbsolute?.y ?? 0;
  const nodeW = node.width ?? 120;
  const nodeH = node.height ?? 80;
  const nodeCenterX = nodeX + nodeW / 2;
  const nodeCenterY = nodeY + nodeH / 2;

  // Si c'est un nœud policy avec un handle de sortie spécifique (legacy)
  if (node.type === 'policy' && handleId && !HANDLE_POSITIONS[handleId]) {
    const handleBounds = (node as unknown as { handleBounds?: { source?: Array<{ id: string; x: number; y: number; width: number; height: number }> } }).handleBounds;
    if (handleBounds?.source) {
      const handle = handleBounds.source.find(h => h.id === handleId);
      if (handle) {
        return {
          x: nodeX + handle.x + handle.width / 2,
          y: nodeY + handle.y + handle.height / 2,
          position: Position.Right,
        };
      }
    }
    return { x: nodeX + nodeW, y: nodeCenterY, position: Position.Right };
  }

  // Si c'est un nœud policyOutput avec l'ancien handle "output" (legacy), le traiter comme "right"
  if (node.type === 'policyOutput' && handleId === 'output') {
    return { x: nodeX + nodeW, y: nodeCenterY, position: Position.Right };
  }

  // Si un handle standard est spécifié, l'utiliser
  if (handleId && HANDLE_POSITIONS[handleId]) {
    const position = HANDLE_POSITIONS[handleId];
    switch (position) {
      case Position.Top:
        return { x: nodeCenterX, y: nodeY, position };
      case Position.Bottom:
        return { x: nodeCenterX, y: nodeY + nodeH, position };
      case Position.Left:
        return { x: nodeX, y: nodeCenterY, position };
      case Position.Right:
        return { x: nodeX + nodeW, y: nodeCenterY, position };
    }
  }

  // Sinon, calculer automatiquement basé sur la position de l'autre nœud
  if (fallbackNode) {
    const otherX = fallbackNode.positionAbsolute?.x ?? 0;
    const otherY = fallbackNode.positionAbsolute?.y ?? 0;
    const otherW = fallbackNode.width ?? 120;
    const otherH = fallbackNode.height ?? 80;
    const otherCenterX = otherX + otherW / 2;
    const otherCenterY = otherY + otherH / 2;

    const dx = otherCenterX - nodeCenterX;
    const dy = otherCenterY - nodeCenterY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > absDy) {
      if (dx > 0) {
        return { x: nodeX + nodeW, y: nodeCenterY, position: Position.Right };
      } else {
        return { x: nodeX, y: nodeCenterY, position: Position.Left };
      }
    } else {
      if (dy > 0) {
        return { x: nodeCenterX, y: nodeY + nodeH, position: Position.Bottom };
      } else {
        return { x: nodeCenterX, y: nodeY, position: Position.Top };
      }
    }
  }

  return { x: nodeX + nodeW, y: nodeCenterY, position: Position.Right };
}

// Trouve le handle le plus proche d'une position
function findClosestHandle(
  node: Node,
  pos: { x: number; y: number }
): string {
  const nodeX = node.positionAbsolute?.x ?? 0;
  const nodeY = node.positionAbsolute?.y ?? 0;
  const nodeW = node.width ?? 120;
  const nodeH = node.height ?? 80;
  const nodeCenterX = nodeX + nodeW / 2;
  const nodeCenterY = nodeY + nodeH / 2;

  const handles: Array<{ id: string; x: number; y: number; dist: number }> = [];

  // Ajouter les handles standards sur les 4 côtés
  // Ces handles sont disponibles pour source ET target sur la plupart des nœuds
  handles.push(
    { id: 'top', x: nodeCenterX, y: nodeY, dist: 0 },
    { id: 'bottom', x: nodeCenterX, y: nodeY + nodeH, dist: 0 },
    { id: 'left', x: nodeX, y: nodeCenterY, dist: 0 },
    { id: 'right', x: nodeX + nodeW, y: nodeCenterY, dist: 0 }
  );

  handles.forEach(h => {
    h.dist = Math.sqrt(Math.pow(pos.x - h.x, 2) + Math.pow(pos.y - h.y, 2));
  });

  handles.sort((a, b) => a.dist - b.dist);

  return handles[0]?.id ?? 'right';
}

interface FloatingEdgeData {
  isExecuted?: boolean;
  isAnimating?: boolean;
  animationProgress?: number; // 0 to 1
  animationDuration?: number; // in ms
}

export function FloatingEdge({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  style,
  data,
  selected,
  interactionWidth = 20,
}: EdgeProps<FloatingEdgeData>) {
  const isExecuted = data?.isExecuted ?? false;
  const isAnimating = data?.isAnimating ?? false;
  const animationDuration = data?.animationDuration ?? 2000;

  const baseColor = isExecuted ? EXECUTED_GREEN : '#FF8C00';
  const { setEdges, getNodes, screenToFlowPosition } = useReactFlow();
  const [dragging, setDragging] = useState<'source' | 'target' | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const [animProgress, setAnimProgress] = useState(0);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const animationRef = useRef<number | null>(null);
  const animStartTime = useRef<number | null>(null);

  const sourceNode = useStore(
    useCallback((store) => store.nodeInternals.get(source), [source])
  );
  const targetNode = useStore(
    useCallback((store) => store.nodeInternals.get(target), [target])
  );

  // Animation de la boule le long du path
  useEffect(() => {
    if (isAnimating && !isExecuted) {
      animStartTime.current = performance.now();
      setAnimProgress(0);

      const animate = (currentTime: number) => {
        if (!animStartTime.current) return;

        const elapsed = currentTime - animStartTime.current;
        const progress = Math.min(elapsed / animationDuration, 1);

        setAnimProgress(progress);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };

      animationRef.current = requestAnimationFrame(animate);

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    } else {
      setAnimProgress(isExecuted ? 1 : 0);
    }
  }, [isAnimating, isExecuted, animationDuration]);

  const handleMouseDown = useCallback(
    (type: 'source' | 'target') => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setDragging(type);
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setDragPos(pos);
      dragStartPos.current = pos;
    },
    [screenToFlowPosition]
  );

  const draggingRef = useRef<'source' | 'target' | null>(null);

  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  const handleMouseMoveRef = useRef<(e: MouseEvent) => void>(() => {});
  const handleMouseUpRef = useRef<(e: MouseEvent) => void>(() => {});

  handleMouseMoveRef.current = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setDragPos(pos);

    const nodes = getNodes();
    const currentDragging = draggingRef.current;

    const nodeUnderCursor = nodes.find((n) => {
      if (currentDragging === 'source' && n.id === target) return false;
      if (currentDragging === 'target' && n.id === source) return false;
      const nodeX = n.position.x;
      const nodeY = n.position.y;
      const nodeW = n.width ?? 120;
      const nodeH = n.height ?? 80;
      return (
        pos.x >= nodeX - 30 &&
        pos.x <= nodeX + nodeW + 30 &&
        pos.y >= nodeY - 30 &&
        pos.y <= nodeY + nodeH + 30
      );
    });

    if (nodeUnderCursor) {
      const closestHandle = findClosestHandle(nodeUnderCursor, pos);
      setHoveredHandle(`${nodeUnderCursor.id}:${closestHandle}`);
    } else {
      setHoveredHandle(null);
    }
  };

  handleMouseUpRef.current = (e: MouseEvent) => {
    if (!draggingRef.current) return;

    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const nodes = getNodes();
    const currentDragging = draggingRef.current;

    const targetNodeUnderCursor = nodes.find((n) => {
      if (currentDragging === 'source' && n.id === target) return false;
      if (currentDragging === 'target' && n.id === source) return false;
      const nodeX = n.position.x;
      const nodeY = n.position.y;
      const nodeW = n.width ?? 120;
      const nodeH = n.height ?? 80;
      return (
        pos.x >= nodeX - 30 &&
        pos.x <= nodeX + nodeW + 30 &&
        pos.y >= nodeY - 30 &&
        pos.y <= nodeY + nodeH + 30
      );
    });

    if (targetNodeUnderCursor) {
      const closestHandle = findClosestHandle(targetNodeUnderCursor, pos);

      const edgeId = id;
      setEdges((edges) => {
        // Trouver l'ancien edge
        const oldEdge = edges.find(e => e.id === edgeId);
        if (!oldEdge) return edges;

        // Créer un nouvel edge avec un nouvel ID (reset du status)
        const newSource = currentDragging === 'source' ? targetNodeUnderCursor.id : oldEdge.source;
        const newSourceHandle = currentDragging === 'source' ? closestHandle : oldEdge.sourceHandle;
        const newTarget = currentDragging === 'target' ? targetNodeUnderCursor.id : oldEdge.target;
        const newTargetHandle = currentDragging === 'target' ? closestHandle : oldEdge.targetHandle;

        const newEdge = {
          id: `edge_${newSource}_${newTarget}_${Date.now()}`,
          source: newSource,
          sourceHandle: newSourceHandle,
          target: newTarget,
          targetHandle: newTargetHandle,
          type: 'floating',
        };

        console.log(`[Edge Reconnect] Suppression de ${edgeId}, création de ${newEdge.id}`);

        // Supprimer l'ancien edge et ajouter le nouveau
        return [...edges.filter(e => e.id !== edgeId), newEdge];
      });
    }

    setDragging(null);
    setDragPos(null);
    setHoveredHandle(null);
    dragStartPos.current = null;
  };

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => handleMouseMoveRef.current(e);
    const onMouseUp = (e: MouseEvent) => handleMouseUpRef.current(e);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging]);

  if (!sourceNode || !targetNode) {
    console.warn(`[FloatingEdge] Edge ${id} non affiché: sourceNode=${source} found=${!!sourceNode}, targetNode=${target} found=${!!targetNode}`);
    return null;
  }

  // Calculer les positions en tenant compte des handles définis
  const sourcePos = getHandlePosition(sourceNode, sourceHandleId, targetNode);
  const targetPos = getHandlePosition(targetNode, targetHandleId, sourceNode);

  // Debug: log si positions sont à 0,0 (problème potentiel)
  if (sourcePos.x === 0 && sourcePos.y === 0 && targetPos.x === 0 && targetPos.y === 0) {
    console.warn(`[FloatingEdge] Edge ${id} positions à zéro - sourceNode.positionAbsolute:`, sourceNode.positionAbsolute, `targetNode.positionAbsolute:`, targetNode.positionAbsolute);
  }

  // Positions pendant le drag
  const displaySx = dragging === 'source' && dragPos ? dragPos.x : sourcePos.x;
  const displaySy = dragging === 'source' && dragPos ? dragPos.y : sourcePos.y;
  const displayTx = dragging === 'target' && dragPos ? dragPos.x : targetPos.x;
  const displayTy = dragging === 'target' && dragPos ? dragPos.y : targetPos.y;

  const [edgePath] = getBezierPath({
    sourceX: displaySx,
    sourceY: displaySy,
    sourcePosition: sourcePos.position,
    targetPosition: targetPos.position,
    targetX: displayTx,
    targetY: displayTy,
  });

  // Calculer la longueur du path pour l'animation
  const pathLength = pathRef.current?.getTotalLength() ?? 0;
  const greenLength = pathLength * animProgress;
  const orangeOffset = pathLength * (1 - animProgress);

  // Position de la boule sur le path
  // Utiliser animProgress pour la position, mais borner à [0, 1] pour éviter les problèmes
  const effectiveProgress = Math.max(0, Math.min(1, animProgress));
  const ballLength = pathLength * effectiveProgress;

  let ballPosition = { x: displaySx, y: displaySy };
  if (pathRef.current && pathLength > 0 && isAnimating) {
    try {
      const point = pathRef.current.getPointAtLength(ballLength);
      ballPosition = { x: point.x, y: point.y };
    } catch {
      // Fallback si le path n'est pas encore prêt
    }
  }

  const interactionColor = isExecuted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 140, 0, 0.2)';
  const circleFillActive = isExecuted ? 'rgba(34, 197, 94, 0.6)' : 'rgba(255, 140, 0, 0.6)';
  const circleFillInactive = isExecuted ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 140, 0, 0.3)';

  // Afficher la bille si:
  // - L'animation est en cours (isAnimating) et pas encore terminée (animProgress < 1)
  // - OU si isAnimating vient de passer à true (même si animProgress est encore à 1 du cycle précédent)
  const showAnimation = isAnimating && !isExecuted;
  const showGreenPath = animProgress > 0 || isExecuted;

  return (
    <g className="react-flow__edge-floating">
      {/* Path d'interaction (zone cliquable élargie) */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={interactionWidth}
        className="react-flow__edge-interaction"
        stroke={interactionColor}
      />

      {/* Path de référence invisible pour les calculs */}
      <path
        ref={pathRef}
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={0}
      />

      {/* Path orange (partie non parcourue) */}
      <path
        d={edgePath}
        fill="none"
        stroke="#FF8C00"
        strokeWidth={style?.strokeWidth ?? 2}
        strokeDasharray={showGreenPath ? `${pathLength}` : undefined}
        strokeDashoffset={showGreenPath ? -greenLength : 0}
        className={!isExecuted && !isAnimating ? 'react-flow__edge-path-animated' : ''}
      />

      {/* Path vert (partie parcourue) */}
      {showGreenPath && (
        <path
          d={edgePath}
          fill="none"
          stroke={EXECUTED_GREEN}
          strokeWidth={style?.strokeWidth ?? 2}
          strokeDasharray={`${pathLength}`}
          strokeDashoffset={orangeOffset}
        />
      )}

      {/* Boule animée */}
      {showAnimation && (
        <>
          {/* Halo autour de la boule */}
          <circle
            cx={ballPosition.x}
            cy={ballPosition.y}
            r={BALL_RADIUS + 4}
            fill="none"
            stroke={EXECUTED_GREEN}
            strokeWidth={2}
            opacity={0.3}
          />
          {/* Boule principale */}
          <circle
            cx={ballPosition.x}
            cy={ballPosition.y}
            r={BALL_RADIUS}
            fill={EXECUTED_GREEN}
            stroke="#fff"
            strokeWidth={2}
          />
        </>
      )}

      {/* Handles de réattribution - visibles uniquement si l'edge est sélectionné ou en cours de drag */}
      {(selected || dragging) && !showAnimation && (
        <g className="edge-reconnect-handles">
          {/* Handle source - draggable */}
          <circle
            cx={displaySx}
            cy={displaySy}
            r={RECONNECT_HANDLE_RADIUS}
            fill={dragging === 'source' ? circleFillActive : circleFillInactive}
            stroke={baseColor}
            strokeWidth={2}
            style={{ cursor: 'move' }}
            onMouseDown={handleMouseDown('source')}
          />

          {/* Handle target - draggable */}
          <circle
            cx={displayTx}
            cy={displayTy}
            r={RECONNECT_HANDLE_RADIUS}
            fill={dragging === 'target' ? circleFillActive : circleFillInactive}
            stroke={baseColor}
            strokeWidth={2}
            style={{ cursor: 'move' }}
            onMouseDown={handleMouseDown('target')}
          />

          {/* Indicateur du handle survolé pendant le drag */}
          {hoveredHandle && dragging && (
            <circle
              cx={dragPos?.x ?? 0}
              cy={dragPos?.y ?? 0}
              r={8}
              fill={baseColor}
              stroke="#fff"
              strokeWidth={2}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </g>
      )}
    </g>
  );
}
