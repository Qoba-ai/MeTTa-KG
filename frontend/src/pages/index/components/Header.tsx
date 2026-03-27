import NameSpace from "./NameSpace";
import NamespaceTabs from "~/pages/index/components/NamespaceTabs";
import { getAllTokens } from "~/lib/api";
import {
  rootToken,
  namespace,
  setNamespace,
  tokenRootNamespace,
} from "~/lib/state";
import ExternalLink from "lucide-solid/icons/external-link";

export default function Header() {
  return (
    <>
      {/* Header */}
      <header
        class="flex items-center justify-between px-4"
        style={{
          background: "var(--header-bg, #0d1120)",
          "border-bottom":
            "1px solid var(--header-border, rgba(0,212,255,0.1))",
          height: "52px",
          "min-height": "52px",
        }}
      >
        {/* Left: Namespace breadcrumb */}
        <div class="flex items-center h-full">
          <NameSpace
            namespace={namespace()}
            setNamespace={setNamespace}
            rootToken={rootToken() ? true : false}
            tokenRootNamespace={tokenRootNamespace}
            getAllTokens={getAllTokens}
          />
        </div>

        {/* Right: External links */}
        <div class="flex items-center gap-1 flex-shrink-0">
          {[
            { label: "MORK", href: "https://github.com/trueagi-io/MORK" },
            { label: "DOCS", href: "https://github.com/trueagi-io/MORK/wiki" },
            {
              label: "COMMUNITY",
              href: "https://chat.singularitynet.io/chat/channels/mork",
            },
          ].map((link, i, arr) => (
            <>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                class="group flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-widest transition-all duration-200"
                style={{
                  color: "#8892a4",
                  "letter-spacing": "0.1em",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#00d4ff";
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(0,212,255,0.06)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#8892a4";
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }}
              >
                {link.label}
                <ExternalLink class="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
              {i < arr.length - 1 && (
                <span
                  style={{ color: "rgba(0,212,255,0.25)", "font-size": "10px" }}
                >
                  ·
                </span>
              )}
            </>
          ))}
        </div>
      </header>

      {/* Namespace Tabs */}
      <NamespaceTabs class="flex items-stretch" />
    </>
  );
}
