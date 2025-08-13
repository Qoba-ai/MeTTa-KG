import CodeEditor from "~/components/space/codeEditor"
import { createResource, For, Show, Suspense } from 'solid-js';
import { readSpace, exploreSpace } from "~/lib/api"

const LoadPage = () => {

	//const [space] = createResource("/", async (source) => {
	//	return await readSpace(source)
	//});

	const [subSpace] = createResource("/", async (source) => {
		let res = await exploreSpace(source, "$x", {
			expr: "$x",
			token: Uint8Array.from([2])
		})
		res = JSON.parse(res)
		res.forEach((each) => {
			console.log("token: ", each.token)
			console.log("expr: ", each.expr)
		})
		return res
	})


	return (
		<div class={`relative w-full h-full`}>
			<Suspense fallback="loading...">
				<Show when={subSpace()} fallback="error when loading space. check mork server logs.">
					<For each={subSpace()}>
						{(item) => (
							<div>
								<span>
									Expr: {item.expr}
								</span>
								<br />
							</div>
						)}
					</For>

					{
						//<CodeEditor space={space()} />
					}
				</Show>
			</Suspense>
		</div>

	);
};

export default LoadPage;
