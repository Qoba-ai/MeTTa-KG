import Sun from "lucide-solid/icons/sun"
import Moon from "lucide-solid/icons/moon"
import NameSpace from "./nameSpace"
import { Accessor, createSignal } from "solid-js"
import { Button } from "../ui/button"
import { useColorMode } from "@kobalte/core"


interface HeaderProps {
    activeTab: Accessor<string>,
    setActiveTab: (tab: string) => void
}

export default function Header() {
    const { colorMode, setColorMode } = useColorMode()

    return (
        <>
            {/* Header */}
            <header class="bg-card border-b border-border p-4">
                <div class="flex items-center justify-between px-4">
                    <div class="flex items-center gap-4">
                        <NameSpace />
                        {/* Theme Toggle */}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setColorMode(colorMode() === "dark" ? "light" : "dark")}>
                        {colorMode() === "dark" ? <Sun class="h-4 w-4" /> : <Moon class="h-4 w-4" />}
                    </Button>
                </div>
            </header>
        </>
    )
}
