import { useCallback } from 'react';
import { useStore, getBezierPath, Position } from 'reactflow';
import type { ConnectionLineComponentProps } from 'reactflow';

export function FloatingConnectionLine({
  toX,
  toY,
  fromPosition,
  fromNode,
}: ConnectionLineComponentProps) {
  const targetNode = useStore(
    useCallback(
      (store) => {
        // Chercher si on survole un nœud
        const nodes = Array.from(store.nodeInternals.values());
        return nodes.find((n) => {
          if (!n.positionAbsolute || !n.width || !n.height) return false;
          const { x, y } = n.positionAbsolute;
          return (
            toX >= x &&
            toX <= x + n.width &&
            toY >= y &&
            toY <= y + n.height
          );
        });
      },
      [toX, toY]
    )
  );

  if (!fromNode) {
    return null;
  }

  const fromNodeWidth = fromNode.width ?? 0;
  const fromNodeHeight = fromNode.height ?? 0;
  const fromX = (fromNode.positionAbsolute?.x ?? 0) + fromNodeWidth / 2;
  const fromY = (fromNode.positionAbsolute?.y ?? 0) + fromNodeHeight / 2;

  let targetX = toX;
  let targetY = toY;
  let targetPosition: Position = fromPosition;

  // Si on survole un nœud cible, connecter au centre du bord le plus proche
  if (targetNode && targetNode.id !== fromNode.id) {
    const targetNodeX = targetNode.positionAbsolute?.x ?? 0;
    const targetNodeY = targetNode.positionAbsolute?.y ?? 0;
    const targetWidth = targetNode.width ?? 0;
    const targetHeight = targetNode.height ?? 0;
    const targetCenterX = targetNodeX + targetWidth / 2;
    const targetCenterY = targetNodeY + targetHeight / 2;

    // Direction du nœud source vers le nœud cible
    const dx = targetCenterX - fromX;
    const dy = targetCenterY - fromY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Déterminer le bord le plus pertinent et utiliser son centre
    if (absDx > absDy) {
      // Connexion horizontale
      if (dx > 0) {
        targetX = targetNodeX;
        targetPosition = Position.Left;
      } else {
        targetX = targetNodeX + targetWidth;
        targetPosition = Position.Right;
      }
      targetY = targetCenterY;
    } else {
      // Connexion verticale
      if (dy > 0) {
        targetY = targetNodeY;
        targetPosition = Position.Top;
      } else {
        targetY = targetNodeY + targetHeight;
        targetPosition = Position.Bottom;
      }
      targetX = targetCenterX;
    }
  }

  const [edgePath] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetPosition: targetPosition,
    targetX: targetX,
    targetY: targetY,
  });

  return (
    <g>
      <path
        fill="none"
        stroke="#FF8C00"
        strokeWidth={2}
        className="animated"
        d={edgePath}
      />
      <circle
        cx={targetX}
        cy={targetY}
        fill="#fff"
        r={3}
        stroke="#FF8C00"
        strokeWidth={1.5}
      />
    </g>
  );
}
