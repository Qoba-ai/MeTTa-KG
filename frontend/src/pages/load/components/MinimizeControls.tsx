import { createSignal } from "solid-js";
import Minimize2 from "lucide-solid/icons/minimize-2";
import Maximize2 from "lucide-solid/icons/maximize-2";
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
    <div class="flex flex-col items-center gap-2 rounded border border-neutral-700 bg-neutral-900/80 p-2">
      <button
        class="flex h-9 w-9 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-300 transition-all duration-200 hover:bg-neutral-800 hover:border-primary hover:text-primary active:scale-95"
        title={isMinimized() ? "Maximize All" : "Minimize All"}
        onClick={handleToggle}
      >
        {isMinimized() ? (
          <Maximize2 class="h-5 w-5" />
        ) : (
          <Minimize2 class="h-5 w-5" />
        )}
      </button>
    </div>
  );
}

export default MinimizeControls;
