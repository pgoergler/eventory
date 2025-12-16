import { useRef, useState } from 'react';
import { availableNodeTypes } from './nodes';

interface SidebarProps {
  onAddNode: (type: string) => void;
  onClear: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onResetSimulation: () => void;
  isSimulationActive: boolean;
}

export function Sidebar({ onAddNode, onClear, onExport, onImport, onResetSimulation, isSimulationActive }: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
      // Reset input pour permettre de réimporter le même fichier
      event.target.value = '';
    }
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!isCollapsed && <h2>Workflow Designer</h2>}
        <button
          className="sidebar-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Agrandir' : 'Réduire'}
        >
          {isCollapsed ? '»' : '«'}
        </button>
      </div>

      <div className="sidebar-section">
        {!isCollapsed && <h3>Ajouter un event</h3>}
        {!isCollapsed && <p className="sidebar-hint">Glissez-déposez ou cliquez</p>}

        <div className={`node-types ${isCollapsed ? 'collapsed' : ''}`}>
          {availableNodeTypes.map((nodeType) => (
            <div
              key={nodeType.type}
              className="node-type-item"
              style={{ borderColor: nodeType.color }}
              draggable
              onDragStart={(e) => onDragStart(e, nodeType.type)}
              onClick={() => onAddNode(nodeType.type)}
              title={isCollapsed ? nodeType.label : undefined}
            >
              <span className="node-type-icon">{nodeType.icon}</span>
              {!isCollapsed && <span className="node-type-label">{nodeType.label}</span>}
            </div>
          ))}
        </div>
      </div>

      {!isCollapsed && (
        <>
          <div className="sidebar-section">
            <h3>Fichier</h3>
            <div className="sidebar-buttons">
              <button className="sidebar-button" onClick={onExport}>
                Exporter JSON
              </button>
              <button className="sidebar-button" onClick={handleImportClick}>
                Importer JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div className="sidebar-section">
            <h3>Simulation</h3>
            <p className="sidebar-hint">Cliquez sur ▶ d'un Trigger pour démarrer</p>
            {isSimulationActive && (
              <button className="sidebar-button" onClick={onResetSimulation}>
                Réinitialiser
              </button>
            )}
          </div>

          <div className="sidebar-section">
            <h3>Actions</h3>
            <button className="sidebar-button danger" onClick={onClear}>
              Effacer tout
            </button>
          </div>

          <div className="sidebar-section sidebar-help">
            <h3>Aide</h3>
            <ul>
              <li>Double-clic pour éditer le nom</li>
              <li>Suppr pour supprimer</li>
              <li>Ctrl+C / Ctrl+V copier/coller</li>
              <li>▶ Trigger démarre la simulation</li>
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}
