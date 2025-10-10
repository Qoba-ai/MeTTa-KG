import Expand from "lucide-solid/icons/expand";
import Shrink from "lucide-solid/icons/shrink";

export interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const ZoomControls = (props: ZoomControlsProps) => {
  const buttonClass =
    "flex h-9 w-9 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-300 transition-all duration-200 hover:bg-neutral-800 hover:border-primary hover:text-primary active:scale-95";

  return (
    <div class="flex flex-col items-center gap-2 rounded border border-neutral-700 bg-neutral-900/80 p-2">
      <button class={buttonClass} title="Expand All" onClick={props.onZoomIn}>
        <Expand class="h-5 w-5" />
      </button>
      <button
        class={buttonClass}
        title="Collapse All"
        onClick={props.onZoomOut}
      >
        <Shrink class="h-5 w-5" />
      </button>
    </div>
  );
};

export default ZoomControls;
