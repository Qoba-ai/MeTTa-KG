import { createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import X from "lucide-solid/icons/x";

type ToastVariant = "default" | "destructive";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastData extends ToastOptions {
  id: number;
  timerId?: number;
}

let toastId = 0;
const [toasts, setToasts] = createSignal<ToastData[]>([]);

export function showToast(options: ToastOptions) {
  const id = ++toastId;
  const duration = options.duration ?? 5000;

  const timerId = setTimeout(() => removeToast(id), duration);

  setToasts((prev) => [...prev, { ...options, id, timerId }]);
}

export function removeToast(id: number) {
  setToasts((prev) => {
    const toastToRemove = prev.find((t) => t.id === id);
    if (toastToRemove?.timerId) {
      clearTimeout(toastToRemove.timerId);
    }
    return prev.filter((t) => t.id !== id);
  });
}

export function ToastViewport() {
  return (
    <Portal>
      <div class="fixed z-[9999] bottom-0 right-0 flex flex-col gap-3 p-4 w-full md:max-w-md">
        <For each={toasts()}>
          {(toast) => {
            const isDestructive = toast.variant === "destructive";
            const emoji = isDestructive ? "🔥" : "✨";

            return (
              <div
                class={`group pointer-events-auto relative flex w-full items-start space-x-4 overflow-hidden rounded-xl border p-4 pr-8 shadow-lg transition-all
                  ${
                    isDestructive
                      ? "border-destructive/50 bg-destructive/10 text-destructive"
                      : "border-border bg-background text-foreground"
                  }`}
              >
                <div class="flex-shrink-0 text-2xl mt-0.5">{emoji}</div>
                <div class="flex-1">
                  <Show when={toast.title}>
                    <div class="text-sm font-semibold">{toast.title}</div>
                  </Show>
                  <Show when={toast.description}>
                    <div class="text-sm opacity-90 mt-1">
                      {toast.description}
                    </div>
                  </Show>
                </div>
                <button
                  class="absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
                  onClick={() => removeToast(toast.id)}
                  aria-label="Close"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
            );
          }}
        </For>
      </div>
    </Portal>
  );
}
