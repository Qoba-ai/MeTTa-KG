import { createResource } from 'solid-js';
import { exploreSpace } from "~/lib/api"

interface SpaceNode {
	id: string,
	label: string,
	remoteData: any,
}

interface SpaceEdge {
	source: SpaceNode["id"]
	target: SpaceNode["id"]
}

const [subSpace] = createResource(
	() => ({
		path: "/",  // change this to namespace signal
		expr: "$x",
		token: Uint8Array.from([2])
	}),
	async ({ path, expr, token }) => { // Destructure the object
		let res = await exploreSpace(path, expr, {
			expr: expr,
			token: token
		});
		res = JSON.parse(res as any);
		//res.forEach((each) => {
		//	console.log("token: ", each.token);
		//	console.log("expr: ", each.expr);
		//});
		return res;
	}
);


// HELPER FUNCTIONS


function initNode(id: string, label: string, remoteData?: any): SpaceNode {
	return {
		id,
		label,
		remoteData
	}
}

function initEdge(source: string, target: string): SpaceEdge {
	return {
		source: source,
		target: target
	}
}

// changes backend responses from `/explore` to correct `SpaceNode` representation
// current format is `{token: Uint8Array, expr: string}`
function initNodeFromApiResponse(data: { token: Uint8Array, expr: string }): SpaceNode {
	return initNode(
		tokenToString(data.token),
		extractLabel(data.expr),
		data
	)
}

// changes a token of type Uint8Array to a unique string representation
function tokenToString(token: Uint8Array): string {
	return token.join("-")
}

// changes a string to a token of type Uint8Array
function stringToToken(token: string): Uint8Array {
	return Uint8Array.from(token.split("-").map((item) => parseInt(item)))
}

// Extracts a label from an expression
function extractLabel(expr: string): string {
	return "Expr"
}

// wraps elements(nodes or edges) insde `data` keys.
function elementsToCyInput(eles: SpaceNode[] | SpaceEdge[]): any[] {
	return eles.map((el) => {
		return {
			data: el
		}
	})
}


export type {
	SpaceNode,
	SpaceEdge,
}

export {
	subSpace,
	initNode,
	initEdge,
	initNodeFromApiResponse,
	tokenToString,
	stringToToken,
	extractLabel,
	elementsToCyInput
}
