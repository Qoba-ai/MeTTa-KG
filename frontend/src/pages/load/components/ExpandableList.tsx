import { For, createSignal, Show, createMemo, createEffect } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import type { SpaceNode } from "~/lib/space";
import { exploreSpace } from "~/lib/api";
import { formatedNamespace } from "~/lib/state";
import { showToast } from "~/components/ui/Toast";
import { initNodesFromApiResponse } from "~/lib/space";

interface ExpressionListProps {
  data: { nodes: SpaceNode[]; prefix: string[] };
  pattern: string;
  onNodeClick?: (node: SpaceNode) => void;
}

interface FlatNode {
  node: SpaceNode;
  id: string;
  depth: number;
  parentId?: string;
}

export default function ExpressionList(props: ExpressionListProps) {
  let scrollRef: HTMLDivElement;
  
  const [expandedNodes, setExpandedNodes] = createSignal<Set<string>>(new Set());
  const [childrenMap, setChildrenMap] = createSignal<Map<string, SpaceNode[]>>(new Map());
  const [loadingNodes, setLoadingNodes] = createSignal<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = createSignal(0);

const getNodeId = (node: SpaceNode) =>
  node.remoteData.token ? Array.from(node.remoteData.token).join(',') : node.label;
  const isExpandable = (node: SpaceNode) => {
    console.log('🔍 Checking expandable for:', node.label, {
      hasToken: !!node.remoteData.token,
      tokenLength: node.remoteData.token?.length,
      tokenValues: node.remoteData.token ? Array.from(node.remoteData.token) : null,
      hasExpr: !!node.remoteData.expr,
      expr: node.remoteData.expr,
      exprLength: node.remoteData.expr?.length,
      exprTrimmed: node.remoteData.expr?.trim()
    });

    // No token = not expandable
    if (!node.remoteData.token || node.remoteData.token.length === 0) {
      console.log('❌ Not expandable: No token or empty token');
      return false;
    }
    
    // Token is [-1] = leaf marker, not expandable
    if (node.remoteData.token.length === 1 && node.remoteData.token[0] === -1) {
      console.log('❌ Not expandable: Token is [-1] leaf marker');
      return false;
    }
    
    // Check if all values in token are -1
    const allMinusOne = Array.from(node.remoteData.token).every(val => val === -1);
    if (allMinusOne) {
      console.log('❌ Not expandable: All token values are -1');
      return false;
    }
    
    // If has valid token (not -1), it's expandable even if it has expr
    // The expr is just metadata that gets displayed, doesn't prevent expansion
    console.log('✅ IS EXPANDABLE! (has valid token)');
    return true;
  };

  // Flatten tree structure for virtualization
  // This recalculates whenever expandedNodes or childrenMap changes
  const getFlattenedNodes = (): FlatNode[] => {
    const result: FlatNode[] = [];
    const expanded = expandedNodes();
    const children = childrenMap();

    console.log('🔄 [NO-CACHE] Flattening tree. Expanded nodes:', Array.from(expanded));
    console.log('🗂️ [NO-CACHE] Children map keys:', Array.from(children.keys()));

    // Track visited nodes to prevent infinite recursion
    const visited = new Set<string>();

    // Recursively add node and its expanded children RIGHT AFTER the parent
    const addNode = (node: SpaceNode, depth: number, path: string) => {
      // Prevent infinite recursion - if we've seen this exact path, skip
      if (visited.has(path)) {
        console.warn(`⚠️ [NO-CACHE] Skipping already visited path: ${path}`);
        return;
      }
      visited.add(path);
      
      // Add current node
      result.push({ node, id: path, depth, parentId: depth > 0 ? path.split('/').slice(0, -1).join('/') : undefined });

      // If expanded, immediately add children right after this node
      if (expanded.has(path) && children.has(path)) {
        const nodeChildren = children.get(path)!;
        console.log(`    ✅ [NO-CACHE] Adding ${nodeChildren.length} children for path "${path}"`);
        nodeChildren.forEach((child, index) => {
          // Create unique path for child using getNodeId + index to handle duplicate labels
          const childPath = `${path}/${getNodeId(child)}#${index}`;
          addNode(child, depth + 1, childPath);
        });
      }
    };

    // Start from root nodes with unique paths using getNodeId
    props.data.nodes.forEach((node, index) => {
      const rootPath = `${getNodeId(node)}#${index}`;
      addNode(node, 0, rootPath);
    });
    
    console.log('📋 [NO-CACHE] Final flattened list has', result.length, 'nodes');
    result.forEach((n, i) => console.log(`   [${i}] depth:${n.depth} ${n.node.label.substring(0, 50)}`));
    
    return result;
  };

  // Use createMemo to cache the flattened nodes
  const flattenedNodes = createMemo<FlatNode[]>(() => {
    const result: FlatNode[] = [];
    const expanded = expandedNodes();
    const children = childrenMap();

    console.log('🔄 [MEMO] Flattening tree. Expanded nodes:', Array.from(expanded));
    console.log('🗂️ [MEMO] Children map keys:', Array.from(children.keys()));

    const visited = new Set<string>();

    const addNode = (node: SpaceNode, depth: number, path: string) => {
      if (visited.has(path)) {
        console.warn(`⚠️ [MEMO] Skipping already visited path: ${path}`);
        return;
      }
      visited.add(path);
      
      result.push({ node, id: path, depth, parentId: depth > 0 ? path.split('/').slice(0, -1).join('/') : undefined });

      if (expanded.has(path) && children.has(path)) {
        const nodeChildren = children.get(path)!;
        console.log(`    ✅ [MEMO] Adding ${nodeChildren.length} children for path "${path}"`);
        nodeChildren.forEach((child, index) => {
          const childPath = `${path}/${getNodeId(child)}#${index}`;
          addNode(child, depth + 1, childPath);
        });
      }
    };

    props.data.nodes.forEach((node, index) => {
      const rootPath = `${getNodeId(node)}#${index}`;
      addNode(node, 0, rootPath);
    });
    
    console.log('📋 [MEMO] Final flattened list has', result.length, 'nodes');
    result.forEach((n, i) => console.log(`   [${i}] depth:${n.depth} ${n.node.label.substring(0, 50)}`));
    
    return result;
  });

  // Use createMemo for the virtualizer
  const virtualizer = createMemo(() => createVirtualizer({
    get count() {
      return flattenedNodes().length;
    },
    getScrollElement: () => scrollRef,
    estimateSize: () => 48,
    overscan: 10,
    getItemKey: (index) => flattenedNodes()[index]?.id ?? index,
  }));

  const toggleNode = async (flatNode: FlatNode) => {
    const { node, id: nodePath } = flatNode;
    const expanded = expandedNodes();
    
    console.log('🖱️ Node clicked:', {
      label: node.label,
      nodePath: nodePath,
      isExpanded: expanded.has(nodePath),
      hasLoadedChildren: childrenMap().has(nodePath),
      isExpandable: isExpandable(node)
    });
    
    // If already expanded, collapse it
    if (expanded.has(nodePath)) {
      console.log('📂 Collapsing node');
      const newExpanded = new Set(expanded);
      newExpanded.delete(nodePath);
      setExpandedNodes(newExpanded);
      return;
    }

    // If children already loaded, just expand
    if (childrenMap().has(nodePath)) {
      console.log('📂 Expanding node with cached children, count:', childrenMap().get(nodePath)!.length);
      setExpandedNodes(new Set(expanded).add(nodePath));
      return;
    }

    // Check if node is expandable
    if (!isExpandable(node)) {
      console.log('🚫 Node not expandable, calling onNodeClick');
      // Not expandable, trigger click handler if provided
      props.onNodeClick?.(node);
      return;
    }

    // Fetch children from API
    console.log('🌐 Fetching children from API...');
    setLoadingNodes(new Set(loadingNodes()).add(nodePath));
    
    try {
      const response = await exploreSpace(
        formatedNamespace(),
        props.pattern,
        node.remoteData.token
      );
      
      console.log('📥 API response received:', response);
      
      const parsed = JSON.parse(response as any);
      console.log('📊 Parsed response:', parsed, 'Length:', parsed?.length);
      
      if (parsed && parsed.length > 0) {
        // Process the API response using your existing logic
        const processedData = initNodesFromApiResponse(parsed);
        console.log('⚙️ Processed data:', {
          nodeCount: processedData.nodes.length,
          prefix: processedData.prefix,
          nodes: processedData.nodes.map(n => ({
            label: n.label,
            hasToken: !!n.remoteData.token,
            tokenLength: n.remoteData.token?.length,
            hasExpr: !!n.remoteData.expr
          }))
        });
        
        if (processedData.nodes.length > 0) {
          // Store children using the unique path as the key
          console.log(`✅ Storing ${processedData.nodes.length} children under path: "${nodePath}"`);
          setChildrenMap(new Map(childrenMap()).set(nodePath, processedData.nodes));
          setExpandedNodes(new Set(expanded).add(nodePath));
        } else {
          console.log('⚠️ No valid children after processing - marking as leaf');
          // No valid children - it's a leaf node
          // Mark it by storing empty array so we don't try to fetch again
          setChildrenMap(new Map(childrenMap()).set(nodePath, []));
          showToast({
            title: "Leaf Node",
            description: "This node has no children to expand.",
            variant: "default",
          });
        }
      } else {
        console.log('⚠️ Empty or null response - marking as leaf');
        // Empty response - it's a leaf node
        // Mark it by storing empty array
        setChildrenMap(new Map(childrenMap()).set(nodePath, []));
        showToast({
          title: "Leaf Node",
          description: "This node has no children to expand.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error('❌ Error expanding node:', error);
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
    } finally {
      const loading = new Set(loadingNodes());
      loading.delete(nodePath);
      setLoadingNodes(loading);
      console.log('🏁 Finished processing node click');
    }
  };

  return (
    <div
      ref={scrollRef!}
      class="w-full h-full overflow-auto custom-scrollbar bg-card rounded-lg border border-border shadow-sm"
    >
      <div
        style={{
          height: `${virtualizer().getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        <For each={virtualizer().getVirtualItems()}>
          {(virtualItem) => {
            const flatNode = flattenedNodes()[virtualItem.index];
            const { node, id: nodeId, depth } = flatNode;
            const isExpanded = expandedNodes().has(nodeId);
            const isLoading = loadingNodes().has(nodeId);
            const canExpand = isExpandable(node);
            const hasChildren = childrenMap().has(nodeId);
            const childCount = hasChildren ? childrenMap().get(nodeId)!.length : 0;
            const isLeaf = hasChildren && childCount === 0;

            return (
              <div
                data-index={virtualItem.index}
                data-key={nodeId}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                  "padding-left": `${depth * 20}px`,
                }}
                class="flex items-center gap-2 px-4 py-2 hover:bg-accent cursor-pointer border-b border-border transition-colors"
                onClick={() => toggleNode(flatNode)}
              >
                {/* Toggle icon */}
                <div class="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  <Show when={isLoading}>
                    <div class="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  </Show>
                  <Show when={!isLoading && canExpand && !isLeaf}>
                    <svg
                      class="w-3 h-3 text-muted-foreground transition-transform"
                      classList={{ "rotate-90": isExpanded }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Show>
                  <Show when={!isLoading && (!canExpand || isLeaf)}>
                    <div class="w-2 h-2 rounded-full bg-muted-foreground opacity-40" />
                  </Show>
                </div>

                {/* Node content */}
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-foreground truncate">
                    {node.label}
                  </div>
                  <Show when={node.remoteData.expr && node.remoteData.expr.trim()}>
                    <div class="text-xs text-muted-foreground font-mono truncate mt-0.5">
                      {node.remoteData.expr}
                    </div>
                  </Show>
                </div>

                {/* Debug info */}
                <div class="text-xs text-muted-foreground font-mono ml-2">
                  {node.remoteData.token ? `[${Array.from(node.remoteData.token).slice(0, 5).join(',')}${node.remoteData.token.length > 5 ? '...' : ''}]` : 'no-token'}
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}