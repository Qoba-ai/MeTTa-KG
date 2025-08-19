import { Component } from 'solid-js';
import { ZoomControlsProps } from '../../types';

const ZoomControls: Component<ZoomControlsProps> = (props) => {
  
  const handleZoomIn = () => {
    // Call the Cytoscape zoom in method
    if ((globalThis as any).cytoscapeControls) {
      (globalThis as any).cytoscapeControls.zoomIn();
    }
    props.onZoomIn();
  };

  const handleZoomOut = () => {
    // Call the Cytoscape zoom out method
    if ((globalThis as any).cytoscapeControls) {
      (globalThis as any).cytoscapeControls.zoomOut();
    }
    props.onZoomOut();
  };

  const handleRecenter = () => {
    // Call the Cytoscape recenter method
    if ((globalThis as any).cytoscapeControls) {
      (globalThis as any).cytoscapeControls.recenter();
    }
    props.onRecenter();
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