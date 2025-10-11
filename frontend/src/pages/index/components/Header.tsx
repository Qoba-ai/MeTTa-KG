import NameSpace from "./NameSpace";
import NamespaceTabs from "~/pages/index/components/NamespaceTabs";

export default function Header() {
  return (
    <>
      {/* Tabs */}

      <NamespaceTabs />

      {/* Header */}
      <header class="h-10 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6">
        <NameSpace />
        {/* Links moved to tab level - removed from here */}
      </header>
    </>
  );
}
