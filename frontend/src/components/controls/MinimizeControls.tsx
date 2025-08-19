import { Component } from 'solid-js';
import { MinimizeControlsProps } from '../../types';

const MinimizeControls: Component<MinimizeControlsProps> = (props) => {
  return (
    <div id="minimize-controls" class="ui-card top-right-secondary">
      <button title="Minimize All" onClick={props.onMinimizeAll}>⊟</button>
      <button title="Maximize All" onClick={props.onMaximizeAll}>⊞</button>
    </div>
  );
};

export default MinimizeControls; 