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
      {/* Tabs */}

      <NamespaceTabs />

      {/* Header */}
      <header class="h-10 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6">
        <NameSpace
          namespace={namespace()}
          setNamespace={setNamespace}
          rootToken={rootToken() ? true : false}
          tokenRootNamespace={tokenRootNamespace}
          getAllTokens={getAllTokens}
        />
        {/* Links moved to tab level - removed from here */}
      </header>
    </>
  );
}
