import { createSignal } from "solid-js";
import Minimize2 from "lucide-solid/icons/minimize-2";
import Maximize2 from "lucide-solid/icons/maximize-2";
import Indent from "lucide-solid/icons/indent";
import Outdent from "lucide-solid/icons/outdent";

interface MinimizeControlsProps {
  onToggleCards: () => void;
  onToggleIndent: () => void;
}

function MinimizeControls(props: MinimizeControlsProps) {
  const [isMinimized, setIsMinimized] = createSignal(false);
  const [isIndented, setIsIndented] = createSignal(true);

  const handleToggleMinimize = () => {
    setIsMinimized(!isMinimized());
    props.onToggleCards();
  };

  const handleToggleIndent = () => {
    setIsIndented(!isIndented());
    props.onToggleIndent();
  };

  return (
    <div class="flex items-center gap-2 rounded border border-neutral-700 bg-neutral-900/80 p-2">
      <button
        class="flex h-9 w-9 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-300 transition-all duration-200 hover:bg-neutral-800 hover:border-primary hover:text-primary active:scale-95"
        title={isMinimized() ? "Maximize All" : "Minimize All"}
        onClick={handleToggleMinimize}
      >
        {isMinimized() ? (
          <Maximize2 class="h-5 w-5" />
        ) : (
          <Minimize2 class="h-5 w-5" />
        )}
      </button>
      <button
        class="flex h-9 w-9 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-300 transition-all duration-200 hover:bg-neutral-800 hover:border-primary hover:text-primary active:scale-95"
        title={isIndented() ? "Remove Indent" : "Add Indent"}
        onClick={handleToggleIndent}
      >
        {isIndented() ? (
          <Outdent class="h-5 w-5" />
        ) : (
          <Indent class="h-5 w-5" />
        )}
      </button>
    </div>
  );
}

export default MinimizeControls;
