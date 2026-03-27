interface NotImplementedProps {
  name: string;
}

export default function NotImplemented({ name }: NotImplementedProps) {
  return (
    <div
      class="w-full h-full flex items-center justify-center p-6"
      style={{ background: "var(--bg-primary, #0a0e1a)" }}
    >
      <div class="flex flex-col items-center justify-center p-12 glass-card rounded-2xl max-w-md text-center">
        <div
          class="w-16 h-16 rounded-full flex items-center justify-center mb-6 neon-glow"
          style={{
            background: "rgba(0,212,255,0.1)",
            border: "1px solid rgba(0,212,255,0.3)",
          }}
        >
          <span class="text-3xl">🚀</span>
        </div>
        <h1 class="text-xl font-bold uppercase tracking-widest neon-text mb-3">
          {name}
        </h1>
        <p
          class="text-sm mb-6 leading-relaxed"
          style={{ color: "var(--text-secondary, #8892a4)" }}
        >
          This module is currently under active development. It will be
          available in a future version of MeTTa-KG.
        </p>
        <div
          class="px-4 py-1.5 rounded-full border text-xs font-semibold tracking-widest uppercase animate-glow-pulse"
          style={{
            "border-color": "rgba(0,212,255,0.3)",
            background: "rgba(0,212,255,0.08)",
            color: "var(--cyan, #00d4ff)",
          }}
        >
          Coming Soon
        </div>
      </div>
    </div>
  );
}
