import dagre from 'dagre';

const nodeWidth = 220;  
const nodeHeight = 50;

export const getLayoutedElements = (nodes, edges) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // 1. Separate "Connected" vs "Isolated"
  const connectedNodeIds = new Set();
  edges.forEach((edge) => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });

  const connectedNodes = nodes.filter((node) => connectedNodeIds.has(node.id));
  const isolatedNodes = nodes.filter((node) => !connectedNodeIds.has(node.id));

  // 2. Dagre Layout (Tree) for connected nodes
  dagreGraph.setGraph({ rankdir: 'TB' }); 

  connectedNodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  let maxY = 0; 

  const layoutedConnected = connectedNodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const x = nodeWithPosition.x - nodeWidth / 2;
    const y = nodeWithPosition.y - nodeHeight / 2;
    if (y > maxY) maxY = y; // Track the bottom of the tree

    return {
      ...node,
      targetPosition: 'top',
      sourcePosition: 'bottom',
      position: { x, y },
    };
  });

  // 3. Grid Layout for Isolated Nodes (UPDATED)
  const startY = maxY + 150; 
  
  // FIX: Increased columns to 10 to make the graph wider (fits screen better)
  const columns = 10; 

  const layoutedIsolated = isolatedNodes.map((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);

    return {
      ...node,
      targetPosition: 'top',
      sourcePosition: 'bottom',
      position: {
        x: col * (nodeWidth + 20), // 20px horizontal gap
        y: startY + (row * (nodeHeight + 20)), // 20px vertical gap
      },
    };
  });

  return { nodes: [...layoutedConnected, ...layoutedIsolated], edges };
};