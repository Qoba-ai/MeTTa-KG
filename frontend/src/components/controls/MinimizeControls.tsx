import { createSignal } from "solid-js";

interface MinimizeControlsProps {
  onToggleCards: () => void;
}

function MinimizeControls(props: MinimizeControlsProps) {
  const [isMinimized, setIsMinimized] = createSignal(false);

  const handleToggle = () => {
    setIsMinimized(!isMinimized());
    props.onToggleCards();
  };

  return (
    <div id="minimize-controls" class="ui-card top-right-secondary">
      <button
        title={isMinimized() ? "Maximize" : "Minimize"}
        onClick={handleToggle}
      >
        {isMinimized() ? "□" : "−"}
      </button>
    </div>
  );
}

export default MinimizeControls;
