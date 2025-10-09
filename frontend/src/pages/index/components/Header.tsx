import Sun from "lucide-solid/icons/sun";
import Moon from "lucide-solid/icons/moon";
import NameSpace from "./NameSpace";
import { Button } from "../../../components/ui/Button";
import { useColorMode } from "@kobalte/core";

export default function Header() {
  const { colorMode, setColorMode } = useColorMode();

  return (
    <>
      {/* Header */}
      <header class="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6">
        <NameSpace />
        <div class="flex items-center gap-4">
          <a
            href="https://github.com/trueagi-io/MORK"
            class="uppercase text-neutral-400 hover:text-orange-500 hover:underline"
          >
            MORK
          </a>
          <span class="text-orange-500">·</span>
          <a
            href="https://github.com/trueagi-io/MORK/wiki"
            class="uppercase text-neutral-400 hover:text-orange-500 hover:underline"
          >
            DOCS
          </a>
          <span class="text-orange-500">·</span>
          <a
            href="https://chat.singularitynet.io/chat/channels/mork"
            class="uppercase text-neutral-400 hover:text-orange-500 hover:underline"
          >
            COMMUNITY
          </a>
        </div>
      </header>
    </>
  );
}
