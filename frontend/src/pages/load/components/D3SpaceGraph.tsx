import { onMount, onCleanup, createEffect } from "solid-js";
import * as d3 from "d3";
import type { SpaceNode } from "~/lib/space";
import {
  convertToD3TreeData,
  initNodesFromApiResponse,
  flattenNodes,
} from "~/lib/space";
import { exploreSpace } from "~/lib/api";
import parse from "s-expression";
import { formatedNamespace } from "~/lib/state";
import { showToast } from "~/components/ui/Toast";

interface D3HierarchyNodeData {
  name: string;
  id: string;
  token?: Uint8Array;
  expr?: string;
  isExpandable?: boolean;
  isFromBackend?: boolean;
  children?: D3HierarchyNodeData[];
}

type D3Node = d3.HierarchyNode<D3HierarchyNodeData> & {
  x0?: number;
  y0?: number;
  _children?: D3Node[];
  _isLeaf?: boolean;
};

interface D3TreeGraphProps {
  data: { nodes: SpaceNode[]; prefix: string[] };
  pattern: string;
  onNodeClick?: (node: SpaceNode) => void;
  ref?: (api: {
    expandAll: () => void;
    collapseAll: () => void;
    collapseToRoot: () => void;
  }) => void;
}

export default function D3TreeGraph(props: D3TreeGraphProps) {
  let containerRef: HTMLDivElement | undefined;
  let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  let g: d3.Selection<SVGGElement, unknown, null, undefined>;
  let root: D3Node;
  let i = 0;

  const expand = (d: D3Node) => {
    if (d._children) {
      d.children = d._children;
      d._children = null;
    }
    if (d.children) {
      d.children.forEach(expand);
    }
  };

  const expandAll = () => {
    if (!root) return;
    expand(root);
    update(root);
  };

  const collapseAll = () => {
    if (!root) return;
    root.descendants().forEach((d: D3Node) => {
      if (d.children) {
        d._children = d.children;
        d.children = null;
      }
    });
    update(root);
  };

  const collapseToRoot = () => {
    if (!root) return;
    root.children?.forEach((child: D3Node) => {
      if (child.children) {
        child._children = child.children;
        child.children = null;
      }
    });
    update(root);
  };

  if (props.ref) {
    props.ref({ expandAll, collapseAll, collapseToRoot });
  }

  const margin = { top: 20, right: 40, bottom: 20, left: 40 };
  const nodeHeight = 36;
  const nodeWidth = 280;
  const duration = 350;
  const indentSize = 28;

  const connector = (link: d3.HierarchyPointLink<D3Node>) => {
    const source = link.source;
    const target = link.target;
    const midY = source.y + indentSize / 2;
    return `M${source.y + 20},${source.x}
            L${midY},${source.x}
            L${midY},${target.x}
            L${target.y},${target.x}`;
  };

  const isExpandable = (d: D3Node) => {
    if (d._isLeaf) return false;
    if (d.children || d._children) return true;

    if (
      d.data.token &&
      Array.isArray(d.data.token) &&
      d.data.token.length === 1 &&
      d.data.token[0] === -1
    ) {
      return false;
    }

    if (d.data.token && Array.from(d.data.token).join(",") === "-1") {
      return false;
    }

    if (d.data.token && d.data.token.length > 0) return true;

    if (d.data.expr && d.data.expr.trim() !== "") {
      try {
        const flatNodes = flattenNodes(parse(d.data.expr));
        return flatNodes.length > 1;
      } catch {
        return false;
      }
    }

    return false;
  };

  const update = (source: D3Node) => {
    if (!containerRef) return;
    const allNodes = root.descendants() as D3Node[];
    const visibleNodes: D3Node[] = [];
    const traverse = (node: D3Node) => {
      visibleNodes.push(node);
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    traverse(root);

    const contentHeight = Math.max(
      containerRef.clientHeight,
      visibleNodes.length * nodeHeight + margin.top + margin.bottom + 40
    );

    d3.select(containerRef)
      .select("svg")
      .transition()
      .duration(duration)
      .attr("height", contentHeight);

    visibleNodes.forEach((n: D3Node, idx: number) => {
      n.x = idx * nodeHeight;
      n.y = n.depth * indentSize;
    });

    const links = root.links();

    const node = g
      .selectAll<SVGGElement, D3Node>("g.node")
      .data(allNodes, (d: D3Node) => d.id);

    const nodeEnter = node
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", `translate(${source.y0},${source.x0})`)
      .style("opacity", 0)
      .style("cursor", "pointer")
      .on("click", (event: PointerEvent, d: D3Node) => handleClick(event, d))
      .on("mouseenter", function (this: SVGGElement) {
        d3.select(this)
          .select(".node-bg")
          .transition()
          .duration(150)
          .style("fill", "hsl(var(--accent))")
          .style("opacity", 0.1);
        d3.select(this)
          .select(".node-border")
          .transition()
          .duration(150)
          .style("stroke", "hsl(var(--accent))")
          .style("opacity", 0.4);
      })
      .on("mouseleave", function (this: SVGGElement) {
        d3.select(this)
          .select(".node-bg")
          .transition()
          .duration(200)
          .style("fill", "transparent")
          .style("opacity", 1);
        d3.select(this)
          .select(".node-border")
          .transition()
          .duration(200)
          .style("stroke", "transparent")
          .style("opacity", 1);
      });

    // Background rect
    nodeEnter
      .append("rect")
      .attr("class", "node-bg")
      .attr("x", -4)
      .attr("y", -nodeHeight / 2 + 2)
      .attr("width", nodeWidth)
      .attr("height", nodeHeight - 4)
      .attr("rx", 8)
      .style("fill", "transparent");

    // Border rect
    nodeEnter
      .append("rect")
      .attr("class", "node-border")
      .attr("x", -4)
      .attr("y", -nodeHeight / 2 + 2)
      .attr("width", nodeWidth)
      .attr("height", nodeHeight - 4)
      .attr("rx", 8)
      .style("fill", "none")
      .style("stroke", "transparent")
      .style("stroke-width", "2px");

    // Connection line to parent
    nodeEnter
      .append("line")
      .attr("class", "parent-line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", -indentSize / 2)
      .attr("y2", 0)
      .style("stroke", "hsl(var(--muted-foreground))")
      .style("stroke-width", "1.5px")
      .style("opacity", (d: D3Node) => (d.depth === 0 ? 0 : 0.5));

    const toggleGroup = nodeEnter
      .append("g")
      .attr("class", "toggle-group")
      .style("opacity", (d: D3Node) =>
        d.children || d._children || isExpandable(d) ? 1 : 0
      );

    toggleGroup
      .append("rect")
      .attr("class", "toggle-bg")
      .attr("x", 4)
      .attr("y", -10)
      .attr("width", 20)
      .attr("height", 20)
      .attr("rx", 4)
      .style("fill", "hsl(var(--muted))")
      .style("stroke", "hsl(var(--border))")
      .style("stroke-width", "1px");

    toggleGroup
      .append("text")
      .attr("class", "toggle-icon")
      .attr("x", 14)
      .attr("y", 0)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", "14px")
      .style("font-weight", "700")
      .style("fill", "hsl(var(--foreground))")
      .style("pointer-events", "none")
      .style("user-select", "none")
      .text((d: D3Node) => {
        if (d.children) return "−";
        if (d._children) return "+";
        return isExpandable(d) ? "+" : "";
      });

    nodeEnter
      .append("circle")
      .attr("class", "node-icon")
      .attr("cx", 14)
      .attr("cy", 0)
      .attr("r", 3)
      .style("fill", "hsl(var(--muted-foreground))")
      .style("opacity", (d: D3Node) =>
        d.children || d._children || isExpandable(d) ? 0 : 0.6
      );

    nodeEnter
      .append("text")
      .attr("class", "node-label")
      .attr("x", 32)
      .attr("y", 0)
      .attr("text-anchor", "start")
      .attr("dominant-baseline", "middle")
      .style("font-size", "14px")
      .style("font-weight", "500")
      .style("fill", "hsl(var(--foreground))")
      .style("pointer-events", "none")
      .style("user-select", "none")
      .text((d: D3Node) => {
        const maxLength = 35;
        return d.data.name.length > maxLength
          ? d.data.name.substring(0, maxLength) + "..."
          : d.data.name;
      });

    nodeEnter.append("title").text((d: D3Node) => d.data.name);

    const nodeUpdate = node
      .merge(nodeEnter)
      .transition()
      .duration(duration)
      .style("opacity", 1)
      .attr("transform", (d: D3Node) => `translate(${d.y},${d.x})`);

    nodeUpdate.select(".toggle-icon").text((d: D3Node) => {
      if (d.children) return "−";
      if (d._children) return "+";
      return isExpandable(d) ? "+" : "";
    });

    nodeUpdate.select(".toggle-group").style("opacity", (d: D3Node) => {
      return d.children || d._children || isExpandable(d) ? 1 : 0;
    });

    nodeUpdate.select(".node-icon").style("opacity", (d: D3Node) => {
      return d.children || d._children || isExpandable(d) ? 0 : 0.6;
    });

    node
      .exit()
      .transition()
      .duration(duration)
      .style("opacity", 0)
      .attr("transform", `translate(${source.y},${source.x})`)
      .remove();

    const link = g
      .selectAll<SVGPathElement, d3.HierarchyLink<D3Node>>("path.link")
      .data(links, (d: d3.HierarchyLink<D3Node>) => d.target.id);

    link
      .enter()
      .insert("path", "g")
      .attr("class", "link")
      .style("fill", "none")
      .style("stroke", "hsl(var(--muted-foreground))")
      .style("stroke-width", "2px")
      .style("opacity", 0)
      .attr("d", () =>
        connector({
          source: { x: source.x0, y: source.y0 },
          target: { x: source.x0, y: source.y0 },
        } as d3.HierarchyPointLink<D3Node>)
      )
      .merge(link)
      .transition()
      .duration(duration)
      .style("opacity", 0.5)
      .attr("d", connector);

    link
      .exit()
      .transition()
      .duration(duration)
      .style("opacity", 0)
      .attr("d", () =>
        connector({
          source: { x: source.x, y: source.y },
          target: { x: source.x, y: source.y },
        } as d3.HierarchyPointLink<D3Node>)
      )
      .remove();

    allNodes.forEach((d: D3Node) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  };

  const handleClick = async (event: PointerEvent, d: D3Node) => {
    event.stopPropagation();

    if (d.children) {
      d._children = d.children;
      d.children = null;
      update(d);
      return;
    }

    if (d._children) {
      d.children = d._children;
      d._children = null;
      update(d);
      return;
    }

    if (!isExpandable(d)) {
      return;
    }

    if (d.data.token && Array.from(d.data.token).join(",") === "-1") {
      return;
    }

    try {
      const spaceNode: SpaceNode = {
        id: d.data.id,
        label: d.data.name,
        remoteData: {
          token: d.data.token,
          expr: d.data.expr,
        },
      };

      if (d.data.token && d.data.token.length === 1 && d.data.token[0] === -1) {
        return;
      }

      if (!d.data.token || d.data.token.length === 0) {
        return;
      }

      const children = await exploreSpace(
        formatedNamespace(),
        props.pattern,
        spaceNode.remoteData.token
      );

      const parsedChildren = JSON.parse(
        children as any /* eslint-disable-line @typescript-eslint/no-explicit-any */
      );

      if (parsedChildren && parsedChildren.length > 0) {
        const newNodesData = initNodesFromApiResponse(parsedChildren);
        const newNodes = newNodesData.nodes;
        const prefix = newNodesData.prefix;

        let currentPath = d.data.id;

        if (prefix.length > 0) {
          prefix.forEach((prefixPart) => {
            currentPath += `/${prefixPart}`;
          });
        }

        const childrenData = newNodes.map((node: SpaceNode) => ({
          name: node.label,
          id: `${currentPath}/${node.label}`,
          token: node.remoteData.token,
          expr: node.remoteData.expr,
          isExpandable: true,
          isFromBackend: true,
        }));

        const childHierarchyNodes = childrenData.map((childData) => {
          const childNode = d3.hierarchy(childData) as D3Node;
          childNode.depth = d.depth + 1;
          childNode.parent = d;
          childNode.id = ++i;
          childNode.x0 = d.x;
          childNode.y0 = d.y;
          return childNode;
        });

        d.children = childHierarchyNodes;
        update(d);
      } else if (
        spaceNode.remoteData.expr &&
        spaceNode.remoteData.expr.trim() !== ""
      ) {
        try {
          const flatNodes = flattenNodes(parse(spaceNode.remoteData.expr));

          let finalValue = null;

          for (const node of flatNodes) {
            if (
              (node.startsWith('"') && node.endsWith('"')) ||
              (node.startsWith("'") && node.endsWith("'"))
            ) {
              finalValue = node.slice(1, -1); // Remove quotes
              break;
            }
          }

          if (!finalValue && flatNodes.length > 0) {
            const lastNode = flatNodes[flatNodes.length - 1];
            if (lastNode && lastNode !== d.data.name) {
              finalValue = lastNode;
            }
          }

          if (
            finalValue &&
            (d.data.name === finalValue ||
              d.data.name === `'${finalValue}'` ||
              d.data.name === `"${finalValue}"`)
          ) {
            d.children = null;
            d._children = null;
            d._isLeaf = true;
            update(d);
            return;
          }

          if (finalValue && finalValue !== d.data.name) {
            const childData = {
              name: finalValue,
              id: `${d.data.id}/value`,
              token: Uint8Array.from([-1]),
              expr: "",
              isExpandable: false,
              isFromBackend: false,
            };

            const childNode = d3.hierarchy(childData) as D3Node;
            childNode.depth = d.depth + 1;
            childNode.parent = d;
            childNode.id = ++i;
            childNode.x0 = d.x;
            childNode.y0 = d.y;

            d.children = [childNode];
            update(d);
          } else {
            d.children = null;
            d._children = null;
            d._isLeaf = true;
            update(d);
          }
        } catch {
          d.children = null;
          d._children = null;
        }
      } else {
        d._isLeaf = true;
        d.children = null;
        d._children = null;
        update(d);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "noRootToken") {
        showToast({
          title: "Token Not Set",
          description: "Please set the token in the Tokens page.",
          variant: "destructive",
        });
      } else {
        showToast({
          title: "Error",
          description: "An error occurred expanding the node.",
          variant: "destructive",
        });
      }
      d._isLeaf = true;
      d.children = null;
      d._children = null;
      update(d);
    }
  };

  onMount(() => {
    if (!containerRef) return;

    const initialHeight = containerRef.clientHeight;

    svg = d3
      .select(containerRef)
      .append("svg")
      .attr("width", "100%")
      .attr("height", initialHeight)
      .style("background", "hsl(var(--background))")
      .style("border-radius", "8px");

    g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const treeData = convertToD3TreeData(props.data, props.pattern);
    root = d3.hierarchy(treeData) as D3Node;
    root.x0 = 0;
    root.y0 = 0;
    root.descendants().forEach((d: D3Node, index: number) => {
      d.id = index;
      i = index;
    });
  });

  createEffect(() => {
    if (!g || !root) return;

    const treeData = convertToD3TreeData(props.data, props.pattern);
    const newRoot = d3.hierarchy(treeData) as D3Node;

    root.data = newRoot.data;
    root.children = newRoot.children;
    root.x0 = 0;
    root.y0 = 0;

    root.descendants().forEach((d: D3Node, index: number) => {
      d.id = index;
      i = index;
      d.y = d.depth * indentSize;

      if (d.depth && d.children) {
        d._children = d.children;
        d.children = null;
      }
    });

    update(root);
  });

  onCleanup(() => {
    if (containerRef) d3.select(containerRef).selectAll("*").remove();
  });

  return (
    <div
      ref={containerRef!}
      class="w-full h-full overflow-auto custom-scrollbar bg-card rounded-lg border border-border shadow-sm"
    />
  );
}
