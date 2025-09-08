import { Route, Router } from "@solidjs/router";
import LoadPage from "./Load";
import UploadPage from "./Upload";
import TransformPage from "./Transform";
import TokensPage from "./Tokens";
import { createSignal } from "solid-js";
import Sidebar from "~/components/common/sidebar";
import Header from "~/components/common/header";
import Upload from "lucide-solid/icons/upload"
import Database from "lucide-solid/icons/database"
import X from "lucide-solid/icons/x"
import RotateCcw from "lucide-solid/icons/rotate-ccw"
import Download from "lucide-solid/icons/download"
import Key from "lucide-solid/icons/key"
import NotImplemented from "~/components/common/NotImplemented";


const sidebarSections = [
	{
		title: "Inspection and Visualization",
		items: [{
			id: "explore",
			label: "Explore Space",
			icon: Database,
			description: "",
			to: "/",
			component: LoadPage
		}],
	},
	{
		title: "Set and Algebraic Operations",
		items: [
			{
				id: "transform",
				label: "Transform",
				icon: RotateCcw,
				description: "Transform current space",
				to: "/transform",
				component: TransformPage
			},
			{
				id: "union",
				label: "Union",
				icon: () => <span class="text-sm font-bold">∪</span>,
				description: "R1 ∪ R2",
				to: "/union",
			},
			{
				id: "intersection",
				label: "Intersection",
				icon: () => <span class="text-sm font-bold">∩</span>,
				description: "R1 ∩ R2",
				to: "/intersection"
			},
			{
				id: "difference",
				label: "Difference",
				icon: () => <span class="text-sm font-bold">∖</span>,
				description: "R1 \ R2",
				to: "/difference"
			},
			{
				id: "restrict",
				label: "Restrict To",
				icon: () => <span class="text-sm font-bold">◁</span>,
				description: "R2 ◁ R1",
				to: "/restrict"
			},
			{
				id: "decapitate",
				label: "Decapitate",
				icon: () => <span class="text-sm">⛰️</span>,
				description: "Remove first n bytes",
				to: "/decapitate"
			},
			{
				id: "head",
				label: "Head",
				icon: () => <span class="text-sm">🎯</span>,
				description: "Keep first n bytes",
				to: "/head"
			},
			{ id: "cartesian", label: "Cartesian Product", icon: X, description: "R1 × R2", to: "/cartesian" },
		],
	},
	{
		title: "Utility",
		items: [
			{ id: "upload", label: "Import", icon: Upload, to: "/upload", component: UploadPage },
			{ id: "export", label: "Export", icon: Download, to: "/export" },
			{
				id: "tokens",
				label: "Tokens",
				icon: Key,
				to: "/tokens",
				component: TokensPage
			},
		],
	},
]



const AppLayout = (props: any) => {
	const [spaces, setSpaces] = createSignal([""]);
	const [isGraph, setIsGraph] = createSignal(false);
	const [activeTab, setActiveTab] = createSignal("explore")

	return (
		<div class="w-full h-screen flex ">
			<div class="flex h-full">
				<Sidebar activeTab={activeTab} setActiveTab={setActiveTab} sidebarSections={sidebarSections} />
			</div>

			<div class="w-full h-full flex flex-col">
				{/* <div class="flex items-center justify-between w-full h-14 shadow-lg shadow-[hsla(var(--secondary-foreground)/0.05)]">
                    <div class="flex items-center">
                        <span class={`text-3xl font-bold text-[hsla(var(--secondary-foreground)/0.7)] ml-10`}>MeTTa-KG</span>
                        <div class="ml-24">
                            <NameSpace />
                        </div>
                    </div>
                </div> */}
				<Header />

				<div class="flex-1 w-full pl-4 pt-2 overflow-y-scroll">
					{props.children}
				</div>
			</div>
		</div>
	);
};

const App = () => {
	return (
		<div class="flex">
			<div class="flex-1 flex flex-col">
				<Router>
					<Route path="*" component={AppLayout}>
						{sidebarSections.map(section => {
							{
								return section.items.map(item => {
									return <Route path={item.to} component={item.component ? <item.component /> : <NotImplemented name={item.label} />} />
								})
							}
						})}
					</Route>
				</Router>
			</div>
		</div>
	);
};

export default App;
