import { Component } from 'solid-js';
import { ZoomControlsProps } from '../../types';

const ZoomControls: Component<ZoomControlsProps> = (props) => {
  
  const handleZoomIn = () => {
    if ((globalThis as any).cytoscapeControls) {
      (globalThis as any).cytoscapeControls.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if ((globalThis as any).cytoscapeControls) {
      (globalThis as any).cytoscapeControls.zoomOut();
    }
  };

  const handleRecenter = () => {
    if ((globalThis as any).cytoscapeControls) {
      (globalThis as any).cytoscapeControls.recenter();
    }
  };

  return (
    <div id="zoom-controls" class="ui-card top-right">
      <button id="zoom-in" title="Zoom In" onClick={handleZoomIn}>+</button>
      <button id="zoom-out" title="Zoom Out" onClick={handleZoomOut}>−</button>
      <button id="recenter" title="Recenter" onClick={handleRecenter}>⌂</button>
    </div>
  );
};

export default ZoomControls;