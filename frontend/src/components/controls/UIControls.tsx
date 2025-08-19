import { Component, createSignal, Show } from 'solid-js';
import { LayoutAlgorithm, LayoutOptions, UIControlsProps } from '../../types';

const UIControls: Component<UIControlsProps> = (props) => {
  const [showLayoutOptions, setShowLayoutOptions] = createSignal(false);
  const [layoutOptions, setLayoutOptions] = createSignal<LayoutOptions>({
    iterations: 300,
    springLength: 200,
    springStrength: 0.1,
    repulsionStrength: 1000,
    damping: 0.9,
    animationDuration: 1500,
    centerForce: 0.01
  });

  const handleApplyLayout = (algorithm: LayoutAlgorithm) => {
    props.onApplyLayout(algorithm, layoutOptions());
  };

  const updateLayoutOption = (key: keyof LayoutOptions, value: number) => {
    setLayoutOptions(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div class="ui-controls">
      {/* Layout Controls */}
      <div class="control-section">
        <h3>Layout</h3>
        <div class="layout-controls">
          <button 
            onClick={() => handleApplyLayout('force-directed')}
            disabled={props.layoutState.isAnimating}
            class={props.layoutState.algorithm === 'force-directed' ? 'active' : ''}
          >
            Force-Directed
          </button>
          <button 
            onClick={() => handleApplyLayout('hierarchical')}
            disabled={props.layoutState.isAnimating}
            class={props.layoutState.algorithm === 'hierarchical' ? 'active' : ''}
          >
            Hierarchical
          </button>
          <button 
            onClick={() => handleApplyLayout('circular')}
            disabled={props.layoutState.isAnimating}
            class={props.layoutState.algorithm === 'circular' ? 'active' : ''}
          >
            Circular
          </button>
          <Show when={props.layoutState.isAnimating}>
            <button onClick={props.onStopLayout} class="stop-layout">
              Stop
            </button>
          </Show>
        </div>
        
        <button 
          onClick={() => setShowLayoutOptions(!showLayoutOptions())}
          class="toggle-options"
        >
          {showLayoutOptions() ? 'Hide' : 'Show'} Options
        </button>

        <Show when={showLayoutOptions()}>
          <div class="layout-options">
            <div class="option-group">
              <label>Animation Duration (ms)</label>
              <input 
                type="range" 
                min="500" 
                max="3000" 
                step="100"
                value={layoutOptions().animationDuration || 1500}
                onInput={(e) => updateLayoutOption('animationDuration', parseInt(e.currentTarget.value))}
              />
              <span>{layoutOptions().animationDuration || 1500}ms</span>
            </div>
            
            <div class="option-group">
              <label>Spring Strength</label>
              <input 
                type="range" 
                min="0.01" 
                max="0.5" 
                step="0.01"
                value={layoutOptions().springStrength || 0.1}
                onInput={(e) => updateLayoutOption('springStrength', parseFloat(e.currentTarget.value))}
              />
              <span>{(layoutOptions().springStrength || 0.1).toFixed(2)}</span>
            </div>
            
            <div class="option-group">
              <label>Repulsion Strength</label>
              <input 
                type="range" 
                min="100" 
                max="3000" 
                step="100"
                value={layoutOptions().repulsionStrength || 1000}
                onInput={(e) => updateLayoutOption('repulsionStrength', parseInt(e.currentTarget.value))}
              />
              <span>{layoutOptions().repulsionStrength || 1000}</span>
            </div>
            
            <div class="option-group">
              <label>Iterations</label>
              <input 
                type="range" 
                min="50" 
                max="500" 
                step="25"
                value={layoutOptions().iterations || 300}
                onInput={(e) => updateLayoutOption('iterations', parseInt(e.currentTarget.value))}
              />
              <span>{layoutOptions().iterations || 300}</span>
            </div>
          </div>
        </Show>

        <Show when={props.layoutState.isAnimating}>
          <div class="layout-progress">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                style={`width: ${props.layoutState.progress * 100}%`}
              />
            </div>
            <span>{Math.round(props.layoutState.progress * 100)}%</span>
          </div>
        </Show>
      </div>

      {/* Display Controls */}
      <div class="control-section">
        <h3>Display</h3>
        <div class="display-controls">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              checked={props.showLabels}
              onChange={(e) => props.onToggleLabels(e.currentTarget.checked)}
            />
            Show Labels
          </label>
        </div>
      </div>

      {/* Export Controls */}
      <div class="control-section">
        <h3>Export</h3>
        <div class="export-controls side-by-side">
          <button onClick={props.onExportPDF}>PDF</button>
          <button onClick={props.onExportPNG}>PNG</button>
        </div>
      </div>
    </div>
  );
};

export default UIControls; 