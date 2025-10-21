import NameSpace from "./NameSpace";

export default function Header() {
  return (
    <>
      {/* Header */}
      <header class="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6">
        <NameSpace />
        <div class="flex items-center gap-4">
          <a
            href="https://github.com/trueagi-io/MORK"
            class="uppercase text-neutral-400 hover:text-primary hover:underline"
          >
            MORK
          </a>
          <span class="text-primary">·</span>
          <a
            href="https://github.com/trueagi-io/MORK/wiki"
            class="uppercase text-neutral-400 hover:text-primary hover:underline"
          >
            DOCS
          </a>
          <span class="text-primary">·</span>
          <a
            href="https://chat.singularitynet.io/chat/channels/mork"
            class="uppercase text-neutral-400 hover:text-primary hover:underline"
          >
            COMMUNITY
          </a>
        </div>
      </header>
    </>
  );
}
