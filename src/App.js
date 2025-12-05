import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ReactFlow, { Controls, Background, useNodesState, useEdgesState, addEdge, MarkerType, getRectOfNodes } from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image'; 
import { analyzeRepo, getFileContent } from './api'; 
import { getLayoutedElements } from './layout';
import Sidebar from './Sidebar';
import CityView from './CityView';
import FileTree from './FileTree';
import * as THREE from 'three'; 

const stringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
};

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [rfInstance, setRfInstance] = useState(null);
  
  const cityViewRef = useRef(); 
  const searchInputRef = useRef(); // Ref for the Search Bar
  
  const [viewMode, setViewMode] = useState('2D'); 
  const [searchQuery, setSearchQuery] = useState('');
  
  // MODES
  const [heatmapMode, setHeatmapMode] = useState(false); 
  const [hotspotMode, setHotspotMode] = useState(false); 
  const [folderColorMode, setFolderColorMode] = useState(false); 
  const [hideIsolated, setHideIsolated] = useState(false); 
  const [scatterMode, setScatterMode] = useState(false);

  const [treeData, setTreeData] = useState(null); 
  const [showFileTree, setShowFileTree] = useState(false); 

  const [highlightedNode, setHighlightedNode] = useState(null);
  const [highlightedNeighbors, setHighlightedNeighbors] = useState(new Set());
  const [blastRadiusNodes, setBlastRadiusNodes] = useState(new Set()); 

  const [selectedNode, setSelectedNode] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [autoSave, setAutoSave] = useState(true); 
  const [saveTrigger, setSaveTrigger] = useState(0); 
  const [resetKey, setResetKey] = useState(0); 
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  // --- NEW: FILE SEARCH HANDLER ---
  const handleSearch = (e) => {
    const query = e.target.value.toLowerCase();
    setSearchQuery(query);
    
    if (query === '') {
        setHighlightedNode(null);
        setHighlightedNeighbors(new Set());
        return;
    }

    // Auto-Find and Zoom to node
    const match = nodes.find(n => n.data.label.toLowerCase().includes(query));
    if (match) {
        // Highlight logic
        setHighlightedNode(match.id);
        
        // Zoom logic (Only works in 2D for now)
        if (viewMode === '2D' && rfInstance) {
            rfInstance.fitView({ nodes: [{id: match.id}], duration: 800, maxZoom: 1.5 });
        }
    }
  };

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e) => {
        // Ctrl + / to Focus Search
        if (e.ctrlKey && e.key === '/') {
            e.preventDefault();
            searchInputRef.current?.focus();
        }
        // Esc to Clear
        if (e.key === 'Escape') {
            if (isSidebarOpen) setIsSidebarOpen(false);
            else {
                clearSelection();
                setSearchQuery(''); // Clear search too
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  // --- DOWNLOAD HANDLER ---
  const handleDownload = async () => {
    showToast("📸 Capturing Image...");
    if (viewMode === '2D') {
        const nodesBounds = getRectOfNodes(nodes);
        const transform = [ -nodesBounds.x + 50, -nodesBounds.y + 50, 1 ];
        const flowElement = document.querySelector('.react-flow__viewport');
        if (flowElement) {
            toPng(document.querySelector('.react-flow'), {
                backgroundColor: isDarkMode ? '#121212' : '#fff',
                width: nodesBounds.width + 100, height: nodesBounds.height + 100,
                style: { width: nodesBounds.width + 100 + 'px', height: nodesBounds.height + 100 + 'px', transform: `translate(${transform[0]}px, ${transform[1]}px) scale(1)` }
            }).then((dataUrl) => {
                const link = document.createElement('a'); link.download = 'code-architecture-2d.png'; link.href = dataUrl; link.click(); showToast("✅ 2D Image Downloaded");
            }).catch(() => showToast("❌ Failed to capture 2D"));
        }
    } else {
        if (cityViewRef.current) {
            try {
                const renderer = cityViewRef.current.renderer();
                renderer.setPixelRatio(2); 
                cityViewRef.current.refresh(); 
                setTimeout(() => {
                    const dataUrl = renderer.domElement.toDataURL('image/png');
                    renderer.setPixelRatio(window.devicePixelRatio);
                    const link = document.createElement('a'); link.download = 'code-architecture-3d.png'; link.href = dataUrl; link.click(); showToast("✅ 3D Image Downloaded");
                }, 50);
            } catch (err) { showToast("❌ Failed to capture 3D"); }
        }
    }
  };

  const calculateBlastRadius = (nodeId) => {
    const affected = new Set();
    const queue = [nodeId];
    affected.add(nodeId);
    while (queue.length > 0) {
      const current = queue.shift();
      edges.forEach(edge => {
        if (edge.target === current && !affected.has(edge.source)) {
          affected.add(edge.source);
          queue.push(edge.source);
        }
      });
    }
    return affected;
  };

  const onNodeContextMenu = (event, node) => {
    event.preventDefault(); 
    const affected = calculateBlastRadius(node.id);
    setBlastRadiusNodes(affected);
    showToast(`⚠️ Blast Radius: ${affected.size} files affected`);
    if (viewMode === '2D' && rfInstance) {
      rfInstance.fitView({ nodes: [...affected].map(id => ({ id })), duration: 800, padding: 0.2 });
    }
  };

  const clearSelection = () => {
    setBlastRadiusNodes(new Set());
    setHighlightedNode(null);
    setHighlightedNeighbors(new Set());
    setIsolatedNodeId(null); 
    setSearchQuery(''); // Also clear search
    showToast("View Reset");
  };

  const [isolatedNodeId, setIsolatedNodeId] = useState(null);

  const handleIsolate = (nodeId) => {
      setIsolatedNodeId(nodeId);
      setIsSidebarOpen(false); 
      showToast("🎯 Focusing on Node Cluster");
      if (rfInstance) setTimeout(() => rfInstance.fitView({ duration: 800 }), 100);
  };

  const filteredNodes = useMemo(() => {
      let baseNodes = nodes;
      if (isolatedNodeId) {
          const neighbors = new Set([isolatedNodeId]);
          edges.forEach(e => {
              if (e.source === isolatedNodeId) neighbors.add(e.target);
              if (e.target === isolatedNodeId) neighbors.add(e.source);
          });
          baseNodes = nodes.filter(n => neighbors.has(n.id));
      } else if (hideIsolated) {
          const connected = new Set();
          edges.forEach(e => { connected.add(e.source); connected.add(e.target); });
          baseNodes = nodes.filter(n => connected.has(n.id));
      }
      return baseNodes;
  }, [nodes, edges, hideIsolated, isolatedNodeId]);

  const filteredEdges = useMemo(() => {
      const nodeIds = new Set(filteredNodes.map(n => n.id));
      return edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [edges, filteredNodes]);

  const getNodeColor = (node) => {
    if (blastRadiusNodes.size > 0) return blastRadiusNodes.has(node.id) ? '#ff0000' : (isDarkMode ? '#333' : '#eeeeee');
    if (hotspotMode) {
        const churn = node.data?.churn || 0;
        if (churn > 20) return '#b71c1c'; 
        if (churn > 10) return '#e57373'; 
        if (churn > 0)  return '#fff176'; 
        return isDarkMode ? '#444' : '#eeeeee'; 
    }
    if (heatmapMode) {
      const loc = node.data?.loc || 0;
      if (loc > 200) return '#ffcdd2'; 
      if (loc > 100) return '#fff9c4'; 
      return '#c8e6c9'; 
    }
    if (folderColorMode) {
        const parts = node.id.split('/');
        const folder = parts.length > 1 ? parts.slice(0, 2).join('/') : 'root';
        return stringToColor(folder);
    }
    const name = (node.data?.label || node.label || "").toLowerCase();
    if (name.includes('db') || name.includes('data')) return '#ef5350'; 
    if (name.includes('service')) return '#42a5f5'; 
    if (name.includes('util') || name.includes('helper')) return '#66bb6a'; 
    if (name.endsWith('.java')) return '#ffa726'; 
    if (name.endsWith('.js') || name.endsWith('.ts')) return '#ffee58'; 
    return isDarkMode ? '#ffffff' : '#ffffff';
  };

  const handleGenerate = async () => {
    setLoading(true);
    setIsSidebarOpen(false); 
    setShowFileTree(false); 
    showToast("🚀 Analyzing...");
    try {
      const data = await analyzeRepo(url);
      setTreeData(data.tree);
      const flowNodes = data.nodes.map((n) => ({
        id: n.id, data: { label: n.label, loc: n.data.loc, churn: n.data.churn }, 
        position: { x: 0, y: 0 },
        style: { border: isDarkMode ? '1px solid #777' : '1px solid #333', padding: '10px', borderRadius: '5px', width: 220, color: '#000' }
      }));
      const flowEdges = data.edges.map((e) => ({
         id: `e-${e.source}-${e.target}`, source: e.source, target: e.target, animated: true,
         style: { stroke: e.isCyclic ? '#ff0000' : '#555', strokeWidth: 2 }, data: { isCyclic: e.isCyclic }
      }));
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      if (rfInstance) setTimeout(() => rfInstance.fitView({ padding: 0.1, duration: 800 }), 100);
      showToast("✅ Analysis Complete!");
    } catch (err) { alert("Error loading repo."); showToast("❌ Error"); }
    setLoading(false);
  };

  const displayNodes = filteredNodes.map((node) => {
    let opacity = 1;
    if (blastRadiusNodes.size > 0) opacity = blastRadiusNodes.has(node.id) ? 1 : 0.1;
    else if (highlightedNode) opacity = (highlightedNode === node.id || highlightedNeighbors.has(node.id)) ? 1 : 0.1;
    else if (searchQuery) opacity = node.data.label.toLowerCase().includes(searchQuery) ? 1 : 0.1;
    return { ...node, style: { ...node.style, background: getNodeColor(node), opacity: opacity, border: blastRadiusNodes.has(node.id) ? '3px solid #000' : node.style.border, boxShadow: blastRadiusNodes.has(node.id) ? '0 0 20px #ff0000' : 'none' } };
  });

  const displayEdges = filteredEdges.map((edge) => {
    let isVisible = true;
    if (blastRadiusNodes.size > 0) isVisible = blastRadiusNodes.has(edge.source) && blastRadiusNodes.has(edge.target);
    const isFocused = highlightedNode && (edge.source === highlightedNode || edge.target === highlightedNode);
    let strokeColor = isDarkMode ? '#888' : '#b1b1b7'; 
    let strokeWidth = 1.5;    
    if (blastRadiusNodes.size > 0) { strokeColor = isDarkMode ? '#fff' : '#000'; strokeWidth = 3; } 
    else if (edge.data?.isCyclic) { strokeColor = '#ff0000'; strokeWidth = 3; } 
    else if (isFocused) { strokeColor = isDarkMode ? '#fff' : '#000'; strokeWidth = 3; } 
    else if (highlightedNode) { strokeColor = isDarkMode ? '#333' : '#ddd'; strokeWidth = 1; }
    return { 
        ...edge, hidden: !isVisible, type: 'default', animated: isFocused || edge.data?.isCyclic, 
        style: { ...edge.style, stroke: strokeColor, strokeWidth: strokeWidth, opacity: highlightedNode && !isFocused ? 0.2 : 1 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: strokeColor }, zIndex: isFocused ? 10 : 0 
    };
  });

  const onNodeClick = async (event, node) => {
    const nodeId = node.id; 
    const fullNode = nodes.find(n => n.id === nodeId);
    if (fullNode) { setSelectedNode({ ...fullNode.data, id: fullNode.id }); } else { setSelectedNode({ ...node, id: nodeId }); }
    setIsSidebarOpen(true);
    setFileContent("Loading code...");
    const code = await getFileContent(nodeId); 
    setFileContent(code);
  };

  const onNodeMouseEnter = useCallback((event, node) => {
    if (searchQuery || blastRadiusNodes.size > 0) return; 
    const neighbors = new Set();
    edges.forEach((edge) => {
      if (edge.source === node.id) neighbors.add(edge.target);
      if (edge.target === node.id) neighbors.add(edge.source);
    });
    setHighlightedNode(node.id);
    setHighlightedNeighbors(neighbors);
  }, [edges, searchQuery, blastRadiusNodes]);

  const onNodeMouseLeave = useCallback(() => {
    setHighlightedNode(null);
    setHighlightedNeighbors(new Set());
  }, []);

  const theme = { bg: isDarkMode ? '#121212' : '#ffffff', header: isDarkMode ? '#1e1e1e' : '#f8f9fa', text: isDarkMode ? '#ffffff' : '#333333', border: isDarkMode ? '#333' : '#ddd', inputBg: isDarkMode ? '#2d2d2d' : '#fff', controlBg: isDarkMode ? '#2d2d2d' : '#eee', legendBg: isDarkMode ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)' };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: theme.bg, color: theme.text }}>
      <div style={{ padding: '15px 20px', background: theme.header, borderBottom: `1px solid ${theme.border}`, display: 'flex', gap: '15px', alignItems: 'center', zIndex: 10, flexWrap:'wrap' }}>
        <h3 style={{margin: 0, marginRight: '10px', color: theme.text}}>CodeViz</h3>
        <input type="text" placeholder="GitHub URL" value={url} onChange={(e) => setUrl(e.target.value)} title="Paste a GitHub repository URL here to analyze it" style={{ padding: '8px 12px', width: '250px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }} />
        <button onClick={handleGenerate} disabled={loading} title="Start scanning and visualizing the codebase" style={{ padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{loading ? 'Analyzing...' : 'Visualize'}</button>
        
        {/* --- RESTORED FILE SEARCH BAR --- */}
        <input 
            ref={searchInputRef}
            type="text" 
            placeholder="🔍 Find file (Ctrl+/)" 
            value={searchQuery}
            onChange={handleSearch}
            title="Search for a specific file by name and zoom to it"
            style={{ marginLeft:'10px', padding: '8px 12px', width: '180px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }} 
        />

        {treeData && ( <button onClick={() => setShowFileTree(!showFileTree)} title="Toggle the File Explorer sidebar" style={{ marginLeft:'10px', padding: '8px 16px', background: isDarkMode ? '#333' : '#ddd', color: theme.text, border: 'none', borderRadius: '4px', cursor: 'pointer' }}> {showFileTree ? 'Hide Folders' : '📂 Folders'} </button> )}
        <div style={{width: '1px', height: '30px', background: theme.border, margin: '0 5px'}}></div>
        <button onClick={() => { const newMode = viewMode === '2D' ? '3D' : '2D'; setViewMode(newMode); showToast(`Switched to ${newMode} Mode`); }} title="Switch between 2D Diagram and 3D City view" style={{ padding: '8px 16px', background: '#673ab7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}> {viewMode === '2D' ? '3D City 🏙️' : '2D Map 🗺️'} </button>
        
        <button onClick={handleDownload} title="Download a high-quality image of the current view" style={{ padding: '8px 16px', background: '#43a047', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>📸 Image</button>

        <div style={{display:'flex', gap:'10px', background: theme.controlBg, padding:'5px 10px', borderRadius:'5px'}}>
            <label style={{display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor:'pointer'}} title="Hide files with no connections"> <input type="checkbox" checked={hideIsolated} onChange={(e) => { setHideIsolated(e.target.checked); showToast(e.target.checked ? "🧹 Isolated Files Hidden" : "Showing All Files"); }} /> 🧹 Clean View </label>
            <label style={{display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor:'pointer'}} title="Color files based on which Folder they belong to"> <input type="checkbox" checked={folderColorMode} onChange={(e) => { setFolderColorMode(e.target.checked); setHotspotMode(false); setHeatmapMode(false); showToast(e.target.checked ? "🎨 Folder Colors ON" : "Folder Colors OFF"); }} /> 🎨 Folder Color </label>
        </div>
        <div style={{display:'flex', gap:'10px', background: theme.controlBg, padding:'5px 10px', borderRadius:'5px'}}>
            <label style={{display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor:'pointer'}} title="Color Red if file is changed frequently in Git history"> <input type="checkbox" checked={hotspotMode} onChange={(e) => { setHotspotMode(e.target.checked); setHeatmapMode(false); setFolderColorMode(false); showToast(e.target.checked ? "🔥 Hotspots Enabled" : "Hotspots Disabled"); }} /> 🔥 Hotspots </label>
            <label style={{display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor:'pointer'}} title="Color Red if file has many Lines of Code (LOC)"> <input type="checkbox" checked={heatmapMode} onChange={(e) => { setHeatmapMode(e.target.checked); setHotspotMode(false); setFolderColorMode(false); showToast(e.target.checked ? "📊 Complexity Enabled" : "Complexity Disabled"); }} /> 📊 Complexity </label>
        </div>
        {viewMode === '3D' && ( <div style={{display:'flex', gap:'10px', alignItems:'center', background:'#e3f2fd', padding:'5px 10px', borderRadius:'5px'}}> <label style={{display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor:'pointer', fontWeight:'bold', color:'#0277bd'}} title="Auto-save position"> <input type="checkbox" checked={autoSave} onChange={(e) => { setAutoSave(e.target.checked); showToast(e.target.checked ? "💾 Auto-save ON" : "💾 Auto-save OFF"); }} /> 💾 Auto-save </label> <label style={{display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor:'pointer', fontWeight:'bold', color:'#e65100'}} title="Explode view"> <input type="checkbox" checked={scatterMode} onChange={(e) => { setScatterMode(e.target.checked); showToast(e.target.checked ? "💥 Scatter ON" : "💥 Scatter OFF"); }} /> 💥 Scatter </label> <button onClick={() => { setSaveTrigger(t => t + 1); showToast("📍 Positions Manually Saved!"); }} disabled={autoSave} title="Save positions" style={{ padding: '4px 8px', background: autoSave ? '#ccc' : '#0277bd', color: 'white', border: 'none', borderRadius: '4px', cursor: autoSave ? 'not-allowed' : 'pointer', fontSize:'12px' }}>Save</button> <button onClick={() => { setResetKey(k => k + 1); showToast("🔄 Layout Reset"); }} title="Reset 3D layout" style={{ padding: '4px 8px', background: '#d32f2f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize:'12px' }}>Reset</button> </div> )}
        <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ marginLeft: 'auto', background:'transparent', border:'none', fontSize:'20px', cursor:'pointer' }} title="Toggle Dark/Light Mode"> {isDarkMode ? '☀️' : '🌙'} </button>
        {(blastRadiusNodes.size > 0 || isolatedNodeId) && ( <button onClick={clearSelection} style={{ marginLeft: '10px', padding: '8px 16px', background: '#ff1744', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} title="Clear Selection (Esc)">❌ Reset View</button> )}
      </div>

      <div style={{ flex: 1, position: 'relative', background: theme.bg, display:'flex' }}>
        {showFileTree && <FileTree data={treeData} onClose={() => setShowFileTree(false)} isDarkMode={isDarkMode} />}
        <div style={{ flex: 1, position: 'relative' }}>
            {viewMode === '2D' ? (
            <ReactFlow nodes={displayNodes} edges={displayEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={onNodeClick} onNodeContextMenu={onNodeContextMenu} onNodeMouseEnter={onNodeMouseEnter} onNodeMouseLeave={onNodeMouseLeave} onInit={setRfInstance} fitView minZoom={0.01}> <Controls /> <Background color={isDarkMode ? '#333' : '#f0f2f5'} gap={16} variant="dots" /> </ReactFlow>
            ) : (
            <CityView ref={cityViewRef} key={resetKey} nodes={filteredNodes} edges={filteredEdges} getNodeColor={getNodeColor} onNodeClick={onNodeClick} hotspotMode={hotspotMode} heatmapMode={heatmapMode} folderColorMode={folderColorMode} autoSave={autoSave} saveTrigger={saveTrigger} isDarkMode={isDarkMode} scatterMode={scatterMode} />
            )}
        </div>
        {toastMsg && ( <div style={{ position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)', color: isDarkMode ? '#000' : '#fff', padding: '12px 24px', borderRadius: '30px', fontSize: '15px', fontWeight: 'bold', boxShadow: '0 5px 20px rgba(0,0,0,0.4)', zIndex: 2000, animation: 'fadeIn 0.3s' }}> {toastMsg} </div> )}
        <div style={{ position: 'absolute', bottom: 30, right: 30, background: theme.legendBg, color: theme.text, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, boxShadow: '0 4px 6px rgba(0,0,0,0.3)', zIndex: 1000, fontSize: '12px' }}>
             <div style={{fontWeight: 'bold', marginBottom: '8px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '5px'}}> {hotspotMode ? '🔥 Git Hotspots' : heatmapMode ? '📊 Complexity (LOC)' : folderColorMode ? '🎨 Folder Districts' : '📁 File Types'} </div>
             {folderColorMode ? ( <div style={{display:'flex', alignItems:'center', gap:'8px'}}>🌈 <span style={{opacity:0.8}}>Colored by distinct parent folder</span></div> ) : hotspotMode ? ( <> <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><div style={{width:12,height:12,background:'#b71c1c'}}></div> High Churn (> 20 commits)</div> <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><div style={{width:12,height:12,background:'#e57373'}}></div> Active (> 10 commits)</div> <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><div style={{width:12,height:12,background:'#fff176'}}></div> Recent (> 0 commits)</div> <div style={{display:'flex',alignItems:'center',gap:'8px', marginBottom:'10px'}}><div style={{width:12,height:12,background: isDarkMode ? '#444' : '#eeeeee'}}></div> Stable (0 commits)</div> </> ) : heatmapMode ? ( <> <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><div style={{width:12,height:12,background:'#ffcdd2'}}></div> High Complexity (> 200 LOC)</div> <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><div style={{width:12,height:12,background:'#fff9c4'}}></div> Medium Complexity</div> <div style={{display:'flex',alignItems:'center',gap:'8px', marginBottom:'10px'}}><div style={{width:12,height:12,background:'#c8e6c9'}}></div> Low Complexity</div> </> ) : ( <> <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><div style={{width:12,height:12,background:'#ef5350'}}></div> Database / Data</div> <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><div style={{width:12,height:12,background:'#42a5f5'}}></div> Service / Logic</div> <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><div style={{width:12,height:12,background:'#66bb6a'}}></div> Utils / Helpers</div> <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><div style={{width:12,height:12,background:'#ffa726'}}></div> Java File</div> <div style={{display:'flex',alignItems:'center',gap:'8px', marginBottom:'10px'}}><div style={{width:12,height:12,background:'#ffee58'}}></div> JS / TS File</div> </> )}
             <div style={{fontWeight: 'bold', marginBottom: '8px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '5px'}}> 🔗 Connections </div>
             <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}> <div style={{width:20,height:2,background: isDarkMode ? '#888' : '#b1b1b7'}}></div> Standard Import </div>
             <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}> <div style={{width:20,height:3,background:'#ff0000'}}></div> Circular Dependency (Bad) </div>
             <div style={{display:'flex',alignItems:'center',gap:'8px'}}> <div style={{width:20,height:3,background: isDarkMode ? '#fff' : '#000'}}></div> Active / Focused </div>
        </div>
      </div>
      {isSidebarOpen && <Sidebar file={selectedNode} content={fileContent} onClose={() => setIsSidebarOpen(false)} isDarkMode={isDarkMode} allNodes={nodes} allEdges={edges} onSelectNode={(n) => onNodeClick(null, n)} onIsolate={(id) => handleIsolate(id)} currentRepoUrl={url} />}
    </div>
  );
}