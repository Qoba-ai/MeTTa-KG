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
          <div class="text-xs text-neutral-500">
            LAST UPDATE: {new Date().toLocaleString()}
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="text-neutral-400 hover:text-orange-500"
            onClick={() =>
              setColorMode(colorMode() === "dark" ? "light" : "dark")
            }
          >
            {colorMode() === "dark" ? (
              <Sun class="h-4 w-4" />
            ) : (
              <Moon class="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>
    </>
  );
}
