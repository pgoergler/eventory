import { useCallback, useState, useRef, useEffect } from 'react';
import { useStore, useReactFlow, getBezierPath, Position } from 'reactflow';
import type { EdgeProps, Node } from 'reactflow';

// Rayon des zones de reconnexion
const RECONNECT_HANDLE_RADIUS = 20;

// Détermine le bord le plus pertinent et retourne le centre de ce bord
function getClosestEdgeCenter(node: Node, otherNode: Node): { x: number; y: number; position: Position } {
  const nodeX = node.positionAbsolute?.x ?? 0;
  const nodeY = node.positionAbsolute?.y ?? 0;
  const nodeW = node.width ?? 0;
  const nodeH = node.height ?? 0;

  const otherX = otherNode.positionAbsolute?.x ?? 0;
  const otherY = otherNode.positionAbsolute?.y ?? 0;
  const otherW = otherNode.width ?? 0;
  const otherH = otherNode.height ?? 0;

  // Centre de chaque nœud
  const nodeCenterX = nodeX + nodeW / 2;
  const nodeCenterY = nodeY + nodeH / 2;
  const otherCenterX = otherX + otherW / 2;
  const otherCenterY = otherY + otherH / 2;

  // Direction vers l'autre nœud
  const dx = otherCenterX - nodeCenterX;
  const dy = otherCenterY - nodeCenterY;

  // Déterminer le bord le plus pertinent basé sur la direction
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx > absDy) {
    // Connexion horizontale (gauche ou droite)
    if (dx > 0) {
      // L'autre nœud est à droite -> connecter sur le bord droit
      return { x: nodeX + nodeW, y: nodeCenterY, position: Position.Right };
    } else {
      // L'autre nœud est à gauche -> connecter sur le bord gauche
      return { x: nodeX, y: nodeCenterY, position: Position.Left };
    }
  } else {
    // Connexion verticale (haut ou bas)
    if (dy > 0) {
      // L'autre nœud est en bas -> connecter sur le bord bas
      return { x: nodeCenterX, y: nodeY + nodeH, position: Position.Bottom };
    } else {
      // L'autre nœud est en haut -> connecter sur le bord haut
      return { x: nodeCenterX, y: nodeY, position: Position.Top };
    }
  }
}

// Calcule les paramètres pour l'edge flottant
function getEdgeParams(source: Node, target: Node) {
  const sourceEdge = getClosestEdgeCenter(source, target);
  const targetEdge = getClosestEdgeCenter(target, source);

  return {
    sx: sourceEdge.x,
    sy: sourceEdge.y,
    tx: targetEdge.x,
    ty: targetEdge.y,
    sourcePos: sourceEdge.position,
    targetPos: targetEdge.position,
  };
}

export function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  interactionWidth = 20,
}: EdgeProps) {
  const { setEdges, getNodes, screenToFlowPosition } = useReactFlow();
  const [dragging, setDragging] = useState<'source' | 'target' | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  const sourceNode = useStore(
    useCallback((store) => store.nodeInternals.get(source), [source])
  );
  const targetNode = useStore(
    useCallback((store) => store.nodeInternals.get(target), [target])
  );

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

  // Refs pour stocker les handlers (évite les closures obsolètes)
  const draggingRef = useRef<'source' | 'target' | null>(null);

  // Mettre à jour la ref quand dragging change
  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  const handleMouseMoveRef = useRef<(e: MouseEvent) => void>(() => {});
  const handleMouseUpRef = useRef<(e: MouseEvent) => void>(() => {});

  // Mettre à jour les refs des handlers
  handleMouseMoveRef.current = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setDragPos(pos);
  };

  handleMouseUpRef.current = (e: MouseEvent) => {
    if (!draggingRef.current) return;

    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const nodes = getNodes();
    const currentDragging = draggingRef.current;

    // Trouver le nœud sous le curseur
    const targetNodeUnderCursor = nodes.find((n) => {
      if (currentDragging === 'source' && n.id === target) return false;
      if (currentDragging === 'target' && n.id === source) return false;
      const nodeX = n.position.x;
      const nodeY = n.position.y;
      const nodeW = n.width ?? 120;
      const nodeH = n.height ?? 80;
      return (
        pos.x >= nodeX &&
        pos.x <= nodeX + nodeW &&
        pos.y >= nodeY &&
        pos.y <= nodeY + nodeH
      );
    });

    if (targetNodeUnderCursor) {
      // Mettre à jour l'edge avec l'ID spécifique
      const edgeId = id;
      setEdges((edges) =>
        edges.map((edge) => {
          if (edge.id === edgeId) {
            if (currentDragging === 'source') {
              return { ...edge, source: targetNodeUnderCursor.id };
            } else {
              return { ...edge, target: targetNodeUnderCursor.id };
            }
          }
          return edge;
        })
      );
    }

    setDragging(null);
    setDragPos(null);
    dragStartPos.current = null;
  };

  // Ajouter/supprimer les listeners globaux pendant le drag
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

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode
  );

  // Positions pendant le drag
  const displaySx = dragging === 'source' && dragPos ? dragPos.x : sx;
  const displaySy = dragging === 'source' && dragPos ? dragPos.y : sy;
  const displayTx = dragging === 'target' && dragPos ? dragPos.x : tx;
  const displayTy = dragging === 'target' && dragPos ? dragPos.y : ty;

  const [edgePath] = getBezierPath({
    sourceX: displaySx,
    sourceY: displaySy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: displayTx,
    targetY: displayTy,
  });

  return (
    <g className="react-flow__edge-floating">
      {/* Path d'interaction (zone cliquable élargie) */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={interactionWidth}
        className="react-flow__edge-interaction"
        stroke="transparent"
      />
      {/* Path visible */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={style}
      />
      {/* Handle source - draggable */}
      <circle
        cx={displaySx}
        cy={displaySy}
        r={RECONNECT_HANDLE_RADIUS}
        fill={dragging === 'source' ? 'rgba(255, 140, 0, 0.6)' : 'rgba(255, 140, 0, 0.3)'}
        stroke="#FF8C00"
        strokeWidth={2}
        style={{ cursor: 'move' }}
        onMouseDown={handleMouseDown('source')}
      />
      {/* Handle target - draggable */}
      <circle
        cx={displayTx}
        cy={displayTy}
        r={RECONNECT_HANDLE_RADIUS}
        fill={dragging === 'target' ? 'rgba(255, 140, 0, 0.6)' : 'rgba(255, 140, 0, 0.3)'}
        stroke="#FF8C00"
        strokeWidth={2}
        style={{ cursor: 'move' }}
        onMouseDown={handleMouseDown('target')}
      />
    </g>
  );
}
