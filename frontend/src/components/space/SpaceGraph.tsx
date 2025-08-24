import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { onCleanup, onMount } from 'solid-js';
import { elementsToCyInput, initEdge, initNode, initNodesFromApiResponse, SpaceNode } from '~/lib/space';
import { exploreSpace } from '~/lib/api';

cytoscape.use(coseBilkent);

interface SpaceGraphProps {
	rootNodes: SpaceNode[]
}

const SpaceGraph = ({ rootNodes }: SpaceGraphProps) => {
	let cyContainer: HTMLDivElement;
	let cy: cytoscape.Core;


	const rootNode: cytoscape.ElementDefinition = elementsToCyInput(
		[
			initNode(
				"root",
				"",
				{ token: Uint8Array.from([]), expr: "" })
		]
	)[0]
	rootNode.style = { "background-color": "blue" }

	const fetchChildren = async (node: cytoscape.NodeSingular) => {
		let children = JSON.parse(await exploreSpace("", "$x", node.scratch().token));
		//children = Array.from(children)
		//children = children.map(item => { return item.token})
		console.log("childre: ", children)
		const newNodes = initNodesFromApiResponse(children);
		const newEdges = newNodes.map(newNode => initEdge(node.id(), newNode.id));
		cy.add(elementsToCyInput(newNodes));
		cy.add(elementsToCyInput(newEdges));
		runLayout();
	}

	const generateRandomChildren = (node: cytoscape.NodeSingular): cytoscape.CollectionReturnValue => {
		const numChildren = Math.floor(Math.random() * 5) + 1;
		const newNodes: cytoscape.ElementDefinition[] = [];
		const newEdges: cytoscape.ElementDefinition[] = [];

		for (let i = 0; i < numChildren % 3; i++) {
			const childId = `${node.id()}${i}`;
			newNodes.push({ data: { id: childId, label: childId }, position: { x: node.position().x, y: node.position().y } });
			newEdges.push({ data: { source: node.id(), target: childId } });
		}
		const nodes = cy.add(newNodes).nodes();
		cy.add(newEdges);
		return nodes
	}

	const runLayout = () => {
		const layout = cy.layout({
			name: 'cose-bilkent',
			animate: true,
			fit: false,
		});
		layout.run();
	}

	const collapseNode = (node: cytoscape.NodeSingular) => {
		const children = node.outgoers();
		if (children.length > 0) {
			//node.data('collapsed', true);
			children.forEach(child => {
				child.data('originalPosition', { ...child.position() });
			});
			children.animate({
				position: node.position(),
				style: { opacity: 0 },
				duration: 200,
				easing: 'ease-in-out-sine',
				complete: () => {
					children.style({ display: 'none' });
					//children.remove()
					node.successors().remove()
					//edges.remove()
					runLayout();
				}
			})
		};
	}

	const expandNode = (node: cytoscape.NodeSingular) => {
		console.log(`Expanding node ${node.id()}`)
		fetchChildren(node);
	};

	const graphColors = {
		nodeBackground: '#21C45D',
		nodeBackgroundHover: '#5a87ff',
		nodeBackgroundSelected: '#3a6bff',

		nodeText: '#e7ecf9',
		edge: '#7aa2ff',
		edgeArrow: '#7aa2ff',
	};

	onMount(() => {
		cy = cytoscape({
			container: cyContainer!,
			elements: [
				rootNode,
				...elementsToCyInput(rootNodes),  // nodes
				...elementsToCyInput(rootNodes.map(node => initEdge(rootNode.data.id!, node.id)))],  // edges to root
			style: [
				{
					selector: 'node',
					style: {
						'background-color': graphColors.nodeBackground,
						'label': 'data(label)',
						'color': graphColors.nodeText,
						'font-size': 7,
						'font-weight': 5000,
						'font-family': "ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji",
						'text-valign': 'center',
						'text-halign': 'center',
						'text-wrap': 'wrap',
						'text-max-width': '30px',
						'width': 40,
						'height': 40,
						'shape': 'ellipse',
						'border-width': 0,
						'transition-property': 'background-color, border-width, width, height',
						'transition-duration': 0.2
					},
				},
				{
					selector: 'edge',
					style: {
						width: 1,
						'line-color': graphColors.edge,
						'target-arrow-color': graphColors.edgeArrow,
						'target-arrow-shape': 'triangle',
					},
				},
			],
			layout: {
				name: 'cose-bilkent',
				animate: false,
			},
		});

		//cy.on('ready', () => {
		//	cy.zoom(2);
		//	cy.center();
		//});

		cy.on('tap', 'node', (event) => {
			const node = event.target;
			if (node.successors().length > 0) {
				collapseNode(node);
			} else {
				expandNode(node);
			}
		});

		cy.on('mouseover', 'node', () => {
		});

		cy.on('mouseout', 'node', () => {
		});
	});

	onCleanup(() => {
		if (cy) {
			cy.destroy();
		}
	});

	return <div class="w-full h-full" ref={cyContainer!} />;
};

export default SpaceGraph;
