import { useColorMode } from "@kobalte/core"

import { Flashlight, FlashlightOff, LaptopMinimal } from "lucide-solid"
import { Button } from "~/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger
} from "~/components/ui/dropdown-menu"

export function ModeToggle() {
	const { setColorMode } = useColorMode()

	return (
			<DropdownMenu>
				<DropdownMenuTrigger as={Button<"button">} variant="ghost" size="sm" class="w-9 px-0">
					<Flashlight class="size-6 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
					<FlashlightOff class="absolute size-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
					<span class="sr-only">Toggle theme</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem onSelect={() => setColorMode("light")}>
						<Flashlight class="mr-2 size-4" />
						<span>Light</span>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setColorMode("dark")}>
						<FlashlightOff class="mr-2 size-4" />
						<span>Dark</span>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setColorMode("system")}>
						<LaptopMinimal class="mr-2 size-4" />
						<span>System</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
	)
}
