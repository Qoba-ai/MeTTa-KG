import { IoContract, IoExpand } from "solid-icons/io";

export interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const ZoomControls = (props: ZoomControlsProps) => {
  const buttonClass =
    "flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-lg font-semibold text-card-foreground transition-all duration-200 hover:bg-accent hover:border-primary active:scale-95";

  return (
    <div class="flex flex-col items-center gap-2 rounded-lg border border-border bg-card/80 p-2 shadow-lg backdrop-blur-md">
      <button class={buttonClass} title="Expand All" onClick={props.onZoomIn}>
        <IoExpand class="h-5 w-5" />
      </button>
      <button
        class={buttonClass}
        title="Collapse All"
        onClick={props.onZoomOut}
      >
        <IoContract class="h-5 w-5" />
      </button>
    </div>
  );
};

export default ZoomControls;
