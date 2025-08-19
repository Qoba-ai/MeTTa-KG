import { Route, Router } from "@solidjs/router";
import { Sidebar } from "~/components/common/Sidebar";
import FileUp from 'lucide-solid/icons/file-up';
import FileDown from 'lucide-solid/icons/file-down';
import Replace from 'lucide-solid/icons/replace';
import Database from 'lucide-solid/icons/database';
import { Switch, SwitchControl, SwitchThumb } from "~/components/ui/switch"
import LoadPage from "./Load";
import UploadPage from "./Upload";
import TransformPage from "./Transform";
import TokensPage from "./Tokens";
import NameSpace from "~/components/common/nameSpace";
import { createSignal } from "solid-js";

const AppLayout = (props: any) => {
	const [spaces, setSpaces] = createSignal([""]);
	const [isGraph, setIsGraph] = createSignal(false);

	const sidbarOptions: any = [
		{
			name: "Load",
			icon: <FileUp size={24} strokeWidth={2} />,
			path: "/",
		},
		{
			name: "Import",
			icon: <FileDown size={24} strokeWidth={2} />,
			path: "/import",
		},
		{
			name: "Transform",
			icon: <Replace size={24} strokeWidth={2} />,
			path: "/transform",
		},
		{
			name: "Manage Tokens",
			icon: <Database size={24} strokeWidth={2} />,
			path: "/tokens",
			separator: true
		},
	]


	return (
		<div class="w-full h-screen flex ">
			<div class="flex h-full">
				<Sidebar options={sidbarOptions} />
				{
					//<div class="flex-1 flex flex-col">
					//	{props.children}
					//</div>
				}
			</div>

			<div class="w-full h-full flex flex-col">
				<div class="flex items-center justify-between w-full h-14 shadow-lg shadow-[hsla(var(--secondary-foreground)/0.05)]">
					<div class="flex items-center">
						<span class={`text-3xl font-bold text-[hsla(var(--secondary-foreground)/0.7)] ml-10`}>MeTTa-KG</span>
						<div class="ml-24">
							<NameSpace spaces={spaces} />
						</div>
					</div>

					<div class="flex justify-center items-center mr-10">
						<span class="mr-4">{isGraph() ? "Graph" : "Code"}</span>
						<Switch checked={isGraph()} onChange={setIsGraph}>
							<SwitchControl>
								<SwitchThumb />
							</SwitchControl>
						</Switch>
					</div>
				</div>

				<div class="flex-1 w-full pl-4 pt-2 overflow-y-scroll">
					{props.children}
				</div>
			</div>

		</div>
	)
}

// /<layout>/<MainPanel>
const App = () => {

	return (
		<div class="flex">
			<div class="flex-1 flex flex-col">
				<Router>
					<Route path="*" component={AppLayout}>
						<Route path="/" component={LoadPage} />
						<Route path="/import" component={UploadPage} />
						<Route path="/transform" component={TransformPage} />
						<Route path="/tokens" component={TokensPage} />
					</Route>
				</Router>
			</div>
		</div>
	)
};


export default App;
