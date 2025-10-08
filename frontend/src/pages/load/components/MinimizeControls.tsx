import { createSignal } from "solid-js";
import { VsCollapseAll, VsExpandAll } from "solid-icons/vs";
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
    <div class="flex flex-col items-center gap-2 rounded-lg border border-border bg-card/80 p-2 shadow-lg backdrop-blur-md">
      <button
        class="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-lg font-semibold text-card-foreground transition-all duration-200 hover:bg-accent hover:border-primary active:scale-95"
        title={isMinimized() ? "Maximize All" : "Minimize All"}
        onClick={handleToggle}
      >
        {isMinimized() ? (
          <VsExpandAll class="h-5 w-5" />
        ) : (
          <VsCollapseAll class="h-5 w-5" />
        )}
      </button>
    </div>
  );
}

export default MinimizeControls;
