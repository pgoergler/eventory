import { useCallback, useState, useRef, useEffect } from 'react';
import { useStore, useReactFlow, getBezierPath, Position } from 'reactflow';
import type { EdgeProps, Node } from 'reactflow';

const RECONNECT_HANDLE_RADIUS = 20;
const EXECUTED_GREEN = '#22c55e';
const BALL_RADIUS = 6;

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
  pos: { x: number; y: number },
  excludeHandleType?: 'source' | 'target'
): string {
  const nodeX = node.positionAbsolute?.x ?? 0;
  const nodeY = node.positionAbsolute?.y ?? 0;
  const nodeW = node.width ?? 120;
  const nodeH = node.height ?? 80;
  const nodeCenterX = nodeX + nodeW / 2;
  const nodeCenterY = nodeY + nodeH / 2;

  const handleBounds = (node as unknown as { handleBounds?: { source?: Array<{ id: string; x: number; y: number; width: number; height: number }>; target?: Array<{ id: string; x: number; y: number; width: number; height: number }> } }).handleBounds;

  const handles: Array<{ id: string; x: number; y: number; dist: number }> = [];

  if (excludeHandleType !== 'target') {
    handles.push(
      { id: 'top', x: nodeCenterX, y: nodeY, dist: 0 },
      { id: 'bottom', x: nodeCenterX, y: nodeY + nodeH, dist: 0 },
      { id: 'left', x: nodeX, y: nodeCenterY, dist: 0 },
      { id: 'right', x: nodeX + nodeW, y: nodeCenterY, dist: 0 }
    );
  }

  if (handleBounds?.source && excludeHandleType !== 'source') {
    handleBounds.source.forEach(h => {
      if (!HANDLE_POSITIONS[h.id]) {
        handles.push({
          id: h.id,
          x: nodeX + h.x + h.width / 2,
          y: nodeY + h.y + h.height / 2,
          dist: 0,
        });
      }
    });
  }

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
      const closestHandle = findClosestHandle(
        nodeUnderCursor,
        pos,
        currentDragging === 'source' ? 'target' : 'source'
      );
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
      const closestHandle = findClosestHandle(
        targetNodeUnderCursor,
        pos,
        currentDragging === 'source' ? 'target' : 'source'
      );

      const edgeId = id;
      setEdges((edges) =>
        edges.map((edge) => {
          if (edge.id === edgeId) {
            if (currentDragging === 'source') {
              return {
                ...edge,
                source: targetNodeUnderCursor.id,
                sourceHandle: closestHandle,
              };
            } else {
              return {
                ...edge,
                target: targetNodeUnderCursor.id,
                targetHandle: closestHandle,
              };
            }
          }
          return edge;
        })
      );
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
    return null;
  }

  // Calculer les positions en tenant compte des handles définis
  const sourcePos = getHandlePosition(sourceNode, sourceHandleId, targetNode);
  const targetPos = getHandlePosition(targetNode, targetHandleId, sourceNode);

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
  let ballPosition = { x: displaySx, y: displaySy };
  if (pathRef.current && (isAnimating || animProgress > 0) && animProgress < 1) {
    try {
      const point = pathRef.current.getPointAtLength(greenLength);
      ballPosition = { x: point.x, y: point.y };
    } catch {
      // Fallback si le path n'est pas encore prêt
    }
  }

  const interactionColor = isExecuted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 140, 0, 0.2)';
  const circleFillActive = isExecuted ? 'rgba(34, 197, 94, 0.6)' : 'rgba(255, 140, 0, 0.6)';
  const circleFillInactive = isExecuted ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 140, 0, 0.3)';

  const showAnimation = (isAnimating || animProgress > 0) && animProgress < 1;
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

      {/* Handle source - draggable (caché pendant l'animation) */}
      {!showAnimation && (
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
      )}

      {/* Handle target - draggable (caché pendant l'animation) */}
      {!showAnimation && (
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
      )}

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
  );
}
