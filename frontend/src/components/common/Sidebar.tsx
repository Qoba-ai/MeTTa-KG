import {
	Upload,
	Database,
	X,
	RotateCcw,
	Download,
	Key,
	Network,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-solid"
import { createSignal } from "solid-js"
import { Button } from "~/components/ui/button"
import { Badge } from "../ui/badge"

export default function Sidbar() {
	const [activeTab, setActiveTab] = createSignal("explore")
	const [isCollapsed, setIsCollapsed] = createSignal(false)

	const sidebarSections = [
		{
			title: "Inspection and Visualization",
			items: [{ id: "explore", label: "Explore Space", icon: Database }],
		},
		{
			title: "Set and Algebraic Operations",
			items: [
				{
					id: "union",
					label: "Union",
					icon: () => <span class="text-sm font-bold">∪</span>,
					description: "R1 ∪ R2",
				},
				{
					id: "intersection",
					label: "Intersection",
					icon: () => <span class="text-sm font-bold">∩</span>,
					description: "R1 ∩ R2",
				},
				{
					id: "difference",
					label: "Difference",
					icon: () => <span class="text-sm font-bold">∖</span>,
					description: "R1 \ R2",
				},
				{
					id: "restrict",
					label: "Restrict To",
					icon: () => <span class="text-sm font-bold">◁</span>,
					description: "R2 ◁ R1",
				},
				{
					id: "decapitate",
					label: "Decapitate",
					icon: () => <span class="text-sm">⛰️</span>,
					description: "Remove first n bytes",
				},
				{
					id: "head",
					label: "Head",
					icon: () => <span class="text-sm">🎯</span>,
					description: "Keep first n bytes",
				},
				{ id: "cartesian", label: "Cartesian Product", icon: X, description: "R1 × R2" },
				{ id: "transform", label: "Transform", icon: RotateCcw, description: "Transform current space" },
			],
		},
		{
			title: "Utility",
			items: [
				{ id: "upload", label: "Import", icon: Upload },
				{ id: "export", label: "Export", icon: Download },
				{ id: "tokens", label: "Tokens", icon: Key },
			],
		},
	]

	return (
		<>
			<div
				class={`relative transition-all duration-300 ease-in-out ${
					isCollapsed() ? "w-20" : "w-80"
				} bg-sidebar border-r border-sidebar-border`}
			>
				<Button
					variant="ghost"
					class="absolute top-5 -right-4 z-10 h-8 w-8 rounded-full p-0 flex items-center justify-center bg-background hover:bg-muted border border-border"
					onClick={() => setIsCollapsed(!isCollapsed())}
				>
					{isCollapsed() ? (
						<ChevronsRight class="h-5 w-5" />
					) : (
						<ChevronsLeft class="h-5 w-5" />
					)}
				</Button>
				<div class={`p-6 ${isCollapsed() ? "px-3" : ""}`}>
					<div
						class={`flex items-center gap-2 mb-8 ${
							isCollapsed() ? "justify-center" : ""
						}`}
					>
						<Network class="h-8 w-8 text-primary" />
						{!isCollapsed() && (
							<h1 class="text-xl font-bold text-sidebar-foreground">MORK-KG</h1>
						)}
					</div>

					{/* <ScrollArea class="h-[calc(100vh-120px)]"> */}
					<nav class="space-y-6">
						{sidebarSections.map((section, index) => (
							<div key={section.title}>
								{isCollapsed() ? (
									index > 0 && <div class="my-3 border-t border-border" />
								) : (
									<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
										{section.title}
									</h3>
								)}
								<div class="space-y-1">
									{section.items.map((item) => {
										const Icon = item.icon
										return (
											<Button
												// key={item.id}
												variant={activeTab() === item.id ? "default" : "ghost"}
												class={`w-full gap-3 h-auto py-2 px-3 ${
													isCollapsed() ? "justify-center" : "justify-start"
												}`}
												onClick={() => setActiveTab(item.id)}
											>
												<div class="flex items-center justify-center w-4 h-4">
													{typeof Icon === "function" &&
													Icon.name === undefined ? (
														<Icon />
													) : (
														<Icon class="h-4 w-4" />
													)}
												</div>
												{!isCollapsed() && (
													<div class="flex-1 text-left">
														<div class="flex items-center gap-2">
															{item.label}
															{item.warning! && (
																<Badge
																	variant="error"
																	class="text-xs px-1 py-0"
																>
																	⚠️
																</Badge>
															)}
														</div>
														{item.description && (
															<div class="text-xs text-muted-foreground mt-0.5">
																{item.description}
															</div>
														)}
													</div>
												)}
											</Button>
										)
									})}
								</div>
							</div>
						))}
					</nav>
					{/* </ScrollArea> */}
				</div>
			</div>
		</>
	)
}
