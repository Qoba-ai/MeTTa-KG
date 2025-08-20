import { createResource } from 'solid-js';
import { exploreSpace } from "~/lib/api"

export interface SpaceNode {
	id: string
}
//{ data: { source: 'cat', target: 'bird' } }
export interface SpaceEdge {
	source: SpaceNode["id"]
	target: SpaceNode["id"]
}

export const [subSpace] = createResource("/", async (source) => {
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
