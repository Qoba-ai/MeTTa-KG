import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { onCleanup, onMount } from 'solid-js';

cytoscape.use(coseBilkent);

const SpaceGraph = () => {
	let cyContainer: HTMLDivElement;
	let cy: cytoscape.Core;

	const dummyData = [
		{ data: { id: 'a', collapsed: false } },
		{ data: { id: 'b', collapsed: false } },
		{ data: { id: 'c', collapsed: false } },
		{ data: { id: 'd', collapsed: false } },
		{ data: { id: 'e', collapsed: false } },
		{ data: { id: 'f', collapsed: false } },
		{ data: { id: 'g', collapsed: false } },
		{ data: { id: 'h', collapsed: false } },
		{ data: { source: 'a', target: 'b' } },
		{ data: { source: 'a', target: 'c' } },
		{ data: { source: 'b', target: 'd' } },
		{ data: { source: 'c', target: 'e' } },
		{ data: { source: 'c', target: 'f' } },
		{ data: { source: 'c', target: 'g' } },
		{ data: { source: 'g', target: 'h' } },
	];

	const generateRandomChildren = (node: cytoscape.NodeSingular): cytoscape.CollectionReturnValue => {
		const numChildren = Math.floor(Math.random() * 5) + 1;
		const newNodes: cytoscape.ElementDefinition[] = [];
		const newEdges: cytoscape.ElementDefinition[] = [];

		for (let i = 0; i < numChildren % 3; i++) {
			const childId = `${node.id()}${i}`;
			newNodes.push({ data: { id: childId }, position: { x: node.position().x, y: node.position().y } });
			newEdges.push({ data: { source: node.id(), target: childId } });
		}
		let nodes = cy.add(newNodes).nodes();
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
		const children = generateRandomChildren(node);
		if (children.length > 0) {
			runLayout();
		}
	};

	onMount(() => {
		cy = cytoscape({
			container: cyContainer,
			elements: dummyData,
			style: [
				{
					selector: 'node',
					style: {
						'background-color': '#666',
						label: 'data(id)',
					},
				},
				{
					selector: 'edge',
					style: {
						width: 3,
						'line-color': '#ccc',
						'target-arrow-color': '#ccc',
						'target-arrow-shape': 'triangle',
					},
				},
			],
			layout: {
				name: 'cose-bilkent',
				animate: false,
			},
		});

		cy.on('tap', 'node', (event) => {
			const node = event.target;
			if (node.successors().length > 0) {
				collapseNode(node);
			} else {
				expandNode(node);
			}
		});
	});

	onCleanup(() => {
		if (cy) {
			cy.destroy();
		}
	});

	return <div class="w-full h-full" ref={cyContainer!} />;
};

export default TestSpaceGraph;
