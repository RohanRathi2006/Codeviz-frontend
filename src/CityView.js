import React, { useMemo, useRef, useEffect, useState, forwardRef } from 'react'; // FIXED IMPORTS
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

// WRAP IN FORWARD REF so App.js can access the 3D Engine for screenshots
const CityView = forwardRef(({ 
  nodes, edges, getNodeColor, onNodeClick, 
  hotspotMode, heatmapMode, folderColorMode,
  autoSave, saveTrigger, isDarkMode,
  scatterMode 
}, ref) => { 
  
  const prevNodesRef = useRef(new Map());
  
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef();

  // 1. DETECT CYCLES
  const hasCycles = useMemo(() => {
    return edges.some(e => e.isCyclic || e.data?.isCyclic);
  }, [edges]);

  // 2. RESIZE OBSERVER
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
      }
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // 3. SCATTER LOGIC
  useEffect(() => {
    const timer = setTimeout(() => {
        if (ref.current) { 
            const chargeForce = ref.current.d3Force('charge');
            const linkForce = ref.current.d3Force('link');

            if (chargeForce) {
                chargeForce.strength(scatterMode ? -2000 : -120);
            }
            if (linkForce) {
                linkForce.distance(scatterMode ? 100 : 30);
            }
            ref.current.d3ReheatSimulation();
        }
    }, 50);
    return () => clearTimeout(timer);
  }, [scatterMode, ref]);

  const hasSavedPositions = prevNodesRef.current.size > 0;
  const layoutMode = (hasSavedPositions || hasCycles || scatterMode) ? null : "td";

  const graphData = useMemo(() => {
    const newNodes = nodes.map(n => {
      const prev = prevNodesRef.current.get(n.id);
      if (prev) {
          return { 
            id: n.id, group: n.data.label, loc: n.data.loc || 10, ...n,
            x: prev.x, y: prev.y, z: prev.z,
            fx: prev.fx, fy: prev.fy, fz: prev.fz
          };
      }
      return { id: n.id, group: n.data.label, loc: n.data.loc || 10, ...n };
    });

    return {
      nodes: newNodes,
      links: edges.map(e => ({ source: e.source, target: e.target }))
    };
  }, [nodes, edges, hotspotMode, heatmapMode, folderColorMode]); 

  // Manual Save Logic
  useEffect(() => {
    if (saveTrigger > 0) {
        const currentMap = new Map();
        if (graphData.nodes) {
            graphData.nodes.forEach(n => {
               currentMap.set(n.id, { x: n.x, y: n.y, z: n.z, fx: n.fx, fy: n.fy, fz: n.fz });
            });
            prevNodesRef.current = currentMap;
            console.log("State Manually Saved");
        }
    }
  }, [saveTrigger, graphData]);

  // Increase repulsion base strength
  useEffect(() => {
    const timer = setTimeout(() => {
        if (ref.current) {
            const charge = ref.current.d3Force('charge');
            if (charge) charge.strength(-120);
        }
    }, 100);
    return () => clearTimeout(timer);
  }, [ref]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <ForceGraph3D
        ref={ref} // Attach the forwarded ref here
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        backgroundColor={isDarkMode ? "#000511" : "#ffffff"} 
        
        // CRITICAL FOR SCREENSHOTS
        rendererConfig={{ preserveDrawingBuffer: true }}
        
        dagMode={layoutMode} 
        dagLevelDistance={80} 
        velocityDecay={0.3} 
        
        warmupTicks={(hasSavedPositions && !scatterMode) ? 0 : 100}
        cooldownTicks={(hasSavedPositions && !scatterMode) ? 0 : 100}
        
        enableNodeDrag={true}
        onNodeDragEnd={node => {
          node.fx = node.x; node.fy = node.y; node.fz = node.z;
          if (autoSave) {
              const prev = prevNodesRef.current.get(node.id) || {};
              prevNodesRef.current.set(node.id, { ...prev, x: node.x, y: node.y, z: node.z, fx: node.x, fy: node.y, fz: node.z });
          }
        }}
        
        onEngineTick={() => {
          if (autoSave) {
              const currentMap = new Map();
              if (graphData && graphData.nodes && graphData.nodes.length > 0) {
                  graphData.nodes.forEach(n => {
                     currentMap.set(n.id, { x: n.x, y: n.y, z: n.z, fx: n.fx, fy: n.fy, fz: n.fz });
                  });
                  prevNodesRef.current = currentMap;
              }
          }
        }}

        nodeThreeObject={node => {
          const height = Math.max(10, (node.loc || 10) / 3); 
          const color = getNodeColor(node);
          const group = new THREE.Group();

          const geometry = new THREE.BoxGeometry(10, height, 10);
          const material = new THREE.MeshPhongMaterial({ color: color, transparent: true, opacity: 0.9 });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.y = height / 2; 
          group.add(mesh);

          const sprite = new SpriteText(node.data.label);
          sprite.color = isDarkMode ? '#fff' : '#000';
          sprite.textHeight = 6;
          sprite.position.y = height + 10; 
          group.add(sprite);

          return group;
        }}
        
        linkWidth={1.5} 
        linkOpacity={0.3} 
        linkColor={() => isDarkMode ? '#ffffff' : '#555555'} 
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={5} 
        linkDirectionalParticleColor={() => '#00d8ff'} 
        
        onNodeClick={(node) => onNodeClick(null, { id: node.id, data: node.data })}
        showNavInfo={true}
      />
    </div>
  );
});

export default CityView;