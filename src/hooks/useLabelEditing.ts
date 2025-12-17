import { useState, useCallback, useEffect } from 'react';

interface UseLabelEditingOptions {
  id: string;
  initialLabel: string;
  onLabelChange?: (nodeId: string, newLabel: string) => void;
}

interface UseLabelEditingReturn {
  label: string;
  isEditing: boolean;
  setLabel: React.Dispatch<React.SetStateAction<string>>;
  handleDoubleClick: () => void;
  handleBlur: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

export function useLabelEditing({
  id,
  initialLabel,
  onLabelChange,
}: UseLabelEditingOptions): UseLabelEditingReturn {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(initialLabel);

  // Sync label with prop changes when not editing
  useEffect(() => {
    if (!isEditing) {
      setLabel(initialLabel);
    }
  }, [initialLabel, isEditing]);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (onLabelChange) {
      onLabelChange(id, label);
    }
  }, [id, onLabelChange, label]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        setIsEditing(false);
        if (onLabelChange) {
          onLabelChange(id, label);
        }
      }
      if (e.key === 'Escape') {
        setLabel(initialLabel);
        setIsEditing(false);
      }
    },
    [id, onLabelChange, label, initialLabel]
  );

  return {
    label,
    isEditing,
    setLabel,
    handleDoubleClick,
    handleBlur,
    handleKeyDown,
  };
}
