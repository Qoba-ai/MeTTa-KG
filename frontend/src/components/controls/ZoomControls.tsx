import { Component } from 'solid-js';
import { ZoomControlsProps } from '../../types';

const ZoomControls: Component<ZoomControlsProps> = (props) => {
  return (
    <div id="zoom-controls" class="ui-card top-right">
      <button id="zoom-in" title="Zoom In" onClick={props.onZoomIn}>+</button>
      <button id="zoom-out" title="Zoom Out" onClick={props.onZoomOut}>−</button>
      <button id="recenter" title="Recenter" onClick={props.onRecenter}>⌂</button>
    </div>
  );
};

export default ZoomControls; 