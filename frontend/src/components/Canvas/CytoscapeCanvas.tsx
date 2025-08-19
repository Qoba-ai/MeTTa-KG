import { Component, createEffect, onMount, onCleanup } from 'solid-js';
import cytoscape, { Core } from 'cytoscape';
import type { LayoutAlgorithm, LayoutOptions } from '../../types';

export interface CytoscapeCanvasProps {
  data?: any[];
  onZoomChange?: (zoom: number) => void;
  onNodeClick?: (node: any) => void;
  onEdgeClick?: (edge: any) => void;
  className?: string;
}

const CytoscapeCanvas: Component<CytoscapeCanvasProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let cy: Core | undefined;
  let currentLayout: ReturnType<Core['layout']> | undefined;

  // Create sample data from subSpace if no data provided
  const getGraphData = () => {
    if (props.data && props.data.length > 0) {
      return props.data.map((item, index) => ({
        group: 'nodes',
        data: {
          id: `node-${index}`,
          label: item.expr || `Node ${index + 1}`,
          type: 'expression',
        }
      }));
    }

    // Default sample data with expandable nodes
    return [
      { group: 'nodes', data: { id: 'a', label: 'gender Chandler M', type: 'fact' } },
      { group: 'nodes', data: { id: 'b', label: 'age Alice 25', type: 'fact' } },
      { group: 'nodes', data: { id: 'asdj', label: 'age Alice 25', type: 'fact' } },
      { group: 'nodes', data: { id: 'c', label: 'is-brother John Adam', type: 'relation' } },
      { group: 'nodes', data: { id: 'd', label: 'likes Alice Coffee', type: 'relation' } },
      { group: 'edges', data: { id: 'ab', source: 'a', target: 'b' } },
      { group: 'edges', data: { id: 'bc', source: 'b', target: 'c' } },
      { group: 'edges', data: { id: 'bd', source: 'b', target: 'd' } }
    ];
  };

  // MORK Trie Demo color scheme - exact match
  const getColors = () => {
    return {
      nodeBackground: '#21C45D',           
      nodeBackgroundHover: '#5a87ff',      
      nodeBackgroundSelected: '#3a6bff',   
      
      nodeText: '#e7ecf9',          
      edge: '#7aa2ff',                     
      edgeArrow: '#7aa2ff',                      
    };
  };

  // Initialize Cytoscape with MORK Trie Demo styling
  onMount(() => {
    if (!containerRef) return;

    const colors = getColors();

    cy = cytoscape({
      container: containerRef,
      elements: getGraphData(),
      
      style: [
        {
          selector: 'node',
          style: {
            'background-color': colors.nodeBackground,
            'label': 'data(label)',
            'color': colors.nodeText,
            'font-size': '7px',
            'font-weight': '500',
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
            'transition-duration': '0.2s'
          }
        },
        
        // Selected state
        {
          selector: 'node:selected',
          style: {
            'background-color': colors.nodeBackgroundSelected,
            'width': 75,
            'height': 75,
            'z-index': 10
          }
        },
        
        // Edge styling - matching MORK demo
        {
          selector: 'edge',
          style: {
            'width': 0.5,
            'line-color': colors.edge,
            'target-arrow-color': colors.edgeArrow,
            'target-arrow-shape': 'triangle',
            'target-arrow-size': 8,
            'curve-style': 'bezier',
            'control-point-step-size': 40,
            'transition-property': 'line-color, target-arrow-color, width',
            'transition-duration': '0.2s'
          }
        },
        
        // Edge hover
        {
          selector: 'edge:hover',
          style: {
            'width': 2.5,
            'line-color': colors.nodeText,
            'target-arrow-color': colors.nodeText,
            'cursor': 'pointer'
          }
        },
        
        // Edge selected
        {
          selector: 'edge:selected',
          style: {
            'width': 3,
            'line-color': colors.nodeBackgroundSelected,
            'target-arrow-color': colors.nodeBackgroundSelected,
            'z-index': 5
          }
        }
      ],

      layout: {
        // Breadthfirst layout like MORK demo
        name: 'breadthfirst',
        directed: true,
        padding: 10,
        spacingFactor: 1.1,
        animate: true,
        animationDuration: 500,
        fit: true
      },

      // Interaction settings
      minZoom: 0.2,
      maxZoom: 4,
      zoomingEnabled: true,
      panningEnabled: true,
      boxSelectionEnabled: true,
      selectionType: 'single',
      wheelSensitivity: 0.1,
      pixelRatio: 'auto',
      motionBlur: false
    });

    // Event handlers - enhanced for expandable nodes
    cy.on('zoom', () => {
      if (props.onZoomChange) {
        props.onZoomChange(cy?.zoom() || 1);
      }
      
      // Adjust font sizes based on zoom
      const zoom = cy.zoom();
      const scaleFactor = Math.max(0.6, Math.min(1.5, 1 / (zoom * 0.7)));
      
      cy.style()
        .selector('node')
        .style({
          'font-size': `${10 * scaleFactor}px`,
        })
        .update();
    });

    cy.on('tap', 'node[expandable = "true"]', (event) => {
      const node = event.target;
      
      // Visual feedback for expandable node click
      node.animate({
        style: {
          'width': 80,
          'height': 80,
          'border-width': 4
        },
        duration: 200,
        complete: () => {
          node.animate({
            style: {
              'width': 60,
              'height': 60,
              'border-width': 2
            },
            duration: 200
          });
        }
      });

      if (props.onNodeClick) {
        props.onNodeClick(node.data());
      }
    });

    cy.on('tap', 'node[expandable = "false"], node:not([expandable])', (event) => {
      const node = event.target;
      
      // Subtle pulse for non-expandable nodes
      node.animate({
        style: {
          'width': 70,
          'height': 70
        },
        duration: 150,
        complete: () => {
          node.animate({
            style: {
              'width': 60,
              'height': 60
            },
            duration: 150
          });
        }
      });

      if (props.onNodeClick) {
        props.onNodeClick(node.data());
      }
    });

    cy.on('tap', 'edge', (event) => {
      const edge = event.target;
      
      // Highlight connected nodes briefly
      const connectedNodes = edge.connectedNodes();
      connectedNodes.animate({
        style: { 
          'border-width': 3,
          'border-color': colors.expandableBackground
        },
        duration: 300,
        complete: () => {
          connectedNodes.animate({
            style: { 
              'border-width': 0,
            },
            duration: 200
          });
        }
      });

      if (props.onEdgeClick) {
        props.onEdgeClick(edge.data());
      }
    });

    // Initial fit with animation
    setTimeout(() => {
      cy.fit(undefined, 30);
    }, 100);
  });

  // Control methods with smooth animations
  const zoomIn = () => {
    if (cy) {
      const currentZoom = cy.zoom();
      cy.animate({
        zoom: {
          level: Math.min(currentZoom * 1.2, 4),
          renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 }
        }
      }, {
        duration: 300,
        easing: 'ease-out'
      });
    }
  };

  const zoomOut = () => {
    if (cy) {
      const currentZoom = cy.zoom();
      cy.animate({
        zoom: {
          level: Math.max(currentZoom * 0.8, 0.2),
          renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 }
        }
      }, {
        duration: 300,
        easing: 'ease-out'
      });
    }
  };

  const recenter = () => {
    if (cy) {
      cy.animate({
        fit: { padding: 30 }
      }, {
        duration: 500,
        easing: 'ease-in-out'
      });
    }
  };

  // Map UI layout options to Cytoscape layouts
  const applyLayout = (algorithm: LayoutAlgorithm, opts: Partial<LayoutOptions> = {}) => {
    if (!cy) return;
    // stop any running layout first
    try { currentLayout?.stop(); } catch {}

    const anim = opts.animationDuration ?? 1500;

    // Notify UI: layout started
    window.dispatchEvent(new CustomEvent('cy:layoutstart', { detail: { algorithm } }));

    if (algorithm === 'force-directed') {
      currentLayout = cy.layout({
        name: 'cose',
        animate: true,
        animationDuration: anim,
        fit: true,
        padding: 20,
        nodeRepulsion: () => opts.repulsionStrength ?? 4000,
        idealEdgeLength: () => opts.springLength ?? 200,
        edgeElasticity: () => opts.springStrength ?? 0.1,
        gravity: opts.centerForce ?? 1,           
        nestingFactor: 1.2,    
        numIter: opts.iterations ?? 300,
        coolingFactor: Math.min(0.99, Math.max(0.5, (opts.damping ?? 0.9))),
        nodeOverlap: 20,
        avoidOverlap: true,
        randomize: false
      });
    } else if (algorithm === 'hierarchical') {
      currentLayout = cy.layout({
        name: 'breadthfirst',
        directed: true,
        spacingFactor: 2.5,
        padding: 16,
        animate: true,
        avoidOverlap: true,
        animationDuration: anim,
        fit: true
      });
    } else { // 'circular'
      currentLayout = cy.layout({
        name: 'circle',
        fit: true,
        padding: 10,
        avoidOverlap: true,
        spacingFactor: 1.0,
        animate: true,
        animationDuration: anim
      });
    }

    // Notify when layout stops
    cy.one('layoutstop', () => {
      window.dispatchEvent(new CustomEvent('cy:layoutstop', { detail: { algorithm } }));
    });

    currentLayout?.run();
  };

  const stopLayout = () => {
    try { currentLayout?.stop(); } catch {}
    currentLayout = undefined;
    // Notify UI: layout stopped
    window.dispatchEvent(new CustomEvent('cy:layoutstop', { detail: {} }));
  };

  const setShowLabels = (show: boolean) => {
    if (!cy) return;
    cy.style()
      .selector('node')
      .style({
        'label': show ? 'data(label)' : '',
        'text-background-opacity': show ? 0.8 : 0
      })
      .update();
  };

  // Exports
  const exportPNG = (scale = 2) => {
    if (!cy) return;
    const url = cy.png({ full: true, scale, bg: '#ffffff' });
    const a = document.createElement('a');
    a.href = url;
    a.download = `graph_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

 const exportPDF = (scale = 2) => {
    if (!cy) return;
    const png = cy.png({ full: true, scale, bg: '#ffffff' });
    // Try jsPDF if present, else fallback to PNG
    const anyWin = window as any;
    if (anyWin.jspdf?.jsPDF) {
      const { jsPDF } = anyWin.jspdf;
      const w = cy.width() * scale;
      const h = cy.height() * scale;
      const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'pt', format: [w, h] });
      pdf.addImage(png, 'PNG', 0, 0, w, h);
      pdf.save(`graph_${Date.now()}.pdf`);
    } else {
      console.warn('jsPDF not found; downloading PNG instead.');
      exportPNG(scale);
    }
  };

  // Update data with smooth transitions
  createEffect(() => {
    if (cy && props.data) {
      cy.animate({
        style: { 'opacity': 0 }
      }, {
        duration: 200,
        complete: () => {
          cy.elements().remove();
          cy.add(getGraphData());
          
          // Apply breadthfirst layout like MORK demo
          const layout = cy.layout({
            name: 'breadthfirst',
            directed: true,
            padding: 10,
            spacingFactor: 1.1,
            animate: true,
            animationDuration: 500,
            fit: true
          });
          
          layout.run();
          
          // Fade in new elements
          setTimeout(() => {
            cy.animate({
              style: { 'opacity': 1 }
            }, {
              duration: 400
            });
          }, 100);
        }
      });
    }
  });

  // Cleanup
  onCleanup(() => {
    try { currentLayout?.stop(); } catch {}
    if (cy) cy.destroy();
  });

  // Expose methods
  (globalThis as any).cytoscapeControls = {
    zoomIn,
    zoomOut,
    recenter,
    applyLayout,
    stopLayout,
    setShowLabels,
    exportPNG,
    exportPDF
  };

  return (
    <div
      ref={containerRef}
      class={props.className || "cytoscape-container"}
    />
  );
};

export default CytoscapeCanvas;