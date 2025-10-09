import { HiOutlineHome, HiOutlineMinus, HiOutlinePlus } from "solid-icons/hi";

export interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
}

const ZoomControls = (props: ZoomControlsProps) => {
  const buttonClass =
    "flex h-9 w-9 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-300 transition-all duration-200 hover:bg-neutral-800 hover:border-orange-500 hover:text-orange-500 active:scale-95";

  return (
    <div class="flex flex-col items-center gap-2 rounded border border-neutral-700 bg-neutral-900/80 p-2">
      <button class={buttonClass} title="Zoom In" onClick={props.onZoomIn}>
        <HiOutlinePlus class="h-5 w-5" />
      </button>
      <button class={buttonClass} title="Zoom Out" onClick={props.onZoomOut}>
        <HiOutlineMinus class="h-5 w-5" />
      </button>
      <button class={buttonClass} title="Recenter" onClick={props.onRecenter}>
        <HiOutlineHome class="h-5 w-5" />
      </button>
    </div>
  );
};

export default ZoomControls;
