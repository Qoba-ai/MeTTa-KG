import NameSpace from "./NameSpace";
import NamespaceTabs from "~/pages/index/components/NamespaceTabs";
import { getAllTokens } from "~/lib/api";
import {
  rootToken,
  namespace,
  setNamespace,
  tokenRootNamespace,
} from "~/lib/state";

export default function Header() {
  return (
    <>
      {/* Header */}
      <header class="bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6">
        <div class="h-14 flex items-center">
          <NameSpace
            namespace={namespace()}
            setNamespace={setNamespace}
            rootToken={rootToken() ? true : false}
            tokenRootNamespace={tokenRootNamespace}
            getAllTokens={getAllTokens}
          />
        </div>
        {/* Links Section */}
        <div class="flex items-center gap-4 px-6 flex-shrink-0">
          <a
            href="https://github.com/trueagi-io/MORK"
            class="uppercase text-neutral-400 hover:text-primary hover:underline text-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            MORK
          </a>
          <span class="text-primary">·</span>
          <a
            href="https://github.com/trueagi-io/MORK/wiki"
            class="uppercase text-neutral-400 hover:text-primary hover:underline text-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            DOCS
          </a>
          <span class="text-primary">·</span>
          <a
            href="https://chat.singularitynet.io/chat/channels/mork"
            class="uppercase text-neutral-400 hover:text-primary hover:underline text-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            COMMUNITY
          </a>
        </div>
      </header>

      {/* Tabs */}

      <NamespaceTabs class="h-10 flex items-stretch" />
    </>
  );
}
