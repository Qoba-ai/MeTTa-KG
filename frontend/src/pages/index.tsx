import { Route, Router } from "@solidjs/router";
import { Sidebar, SidebarProps } from "~/components/common/Sidebar";
import { FileUp, FileDown, Replace, Database } from 'lucide-solid';
import LoadPage from "./Load";
import ImportPage from "./Import";
import TransformPage from "./Transform";
import TokensPage from "./Tokens";

const AppLayout = (props: any) => {
	const sidbarOptions: SidebarProps["options"] = [
		{
			name: "Load",
			icon: <FileUp strokeWidth={1.5} />,
			path: "/",
		},
		{
			name: "Import",
			icon: <FileDown strokeWidth={1.5} />,
			path: "/import",
		},
		{
			name: "Transform",
			icon: <Replace strokeWidth={1.5} />,
			path: "/transform",
		},
		{
			name: "Manage Tokens",
			icon: <Database strokeWidth={1.5} />,
			path: "/tokens",
			separator: true
		},
	]


	return (

		<div class="flex">
			<Sidebar options={sidbarOptions} />
			<div class="flex-1 flex flex-col min-h-screen">
				{props.children}
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
						<Route path="/import" component={ImportPage} />
						<Route path="/transform" component={TransformPage} />
						<Route path="/tokens" component={TokensPage} />
					</Route>
				</Router>
			</div>
		</div>
	)
};


export default App;
