
interface MinimizeControlsProps {
  onToggleCards: () => void
}

function MinimizeControls(props: MinimizeControlsProps)  {
  return (
    <div id="minimize-controls" class="ui-card top-right-secondary">
      <button title="Minimize/Maximize" onClick={props.onToggleCards}>⊞</button>
    </div>
  );
};

export default MinimizeControls; 