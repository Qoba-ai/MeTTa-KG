import { createSignal, Show } from 'solid-js';
import { Code, Workflow } from 'lucide-solid';
import { Switch, SwitchControl, SwitchThumb } from "~/components/ui/switch"

const LoadPage = () => {
	const [isGraph, setIsGraph] = createSignal(false);

	return (
		<div class={`relative w-full h-52`}>
			<div class="flex justify-end mb-10 absolute top-8 right-8">
				<span class="mr-4">{isGraph() ? "Graph" : "Code"}</span>
				<Switch checked={isGraph()} onChange={setIsGraph}>
					<SwitchControl>
						<SwitchThumb />
					</SwitchControl>
				</Switch>
			</div>
		</div>
	);
};

export default LoadPage;
