import React, { useState, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown'; 
import { explainCode } from './api'; 

export default function Sidebar({ 
    file, content, onClose, isDarkMode, 
    allNodes, allEdges, onSelectNode, onIsolate,
    currentRepoUrl // NEW PROP needed to build GitHub links
}) {
  const [activeTab, setActiveTab] = useState('code'); 
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);

  const relations = useMemo(() => {
      if (!file) return { parents: [], children: [] };
      const parents = []; const children = []; 
      allEdges.forEach(edge => {
          if (edge.target === file.id) parents.push(allNodes.find(n => n.id === edge.source));
          if (edge.source === file.id) children.push(allNodes.find(n => n.id === edge.target));
      });
      return { parents, children };
  }, [file, allNodes, allEdges]);

  const handleExplain = async () => {
    setLoading(true);
    const result = await explainCode(content);
    setExplanation(result);
    setLoading(false);
  };

  // OPEN ON GITHUB LOGIC
  const openGitHub = () => {
      if (!currentRepoUrl || !file) return;
      // Convert "github.com/user/repo" -> "github.com/user/repo/blob/master/path/to/file"
      // Note: We assume 'HEAD' or 'main' usually works, but specific branch detection is harder.
      // We will try 'HEAD' which GitHub usually redirects correctly.
      const fileUrl = `${currentRepoUrl}/blob/HEAD/${file.id}`;
      window.open(fileUrl, '_blank');
  };

  const getLanguage = (filename) => {
    if (!filename) return 'text';
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.java')) return 'java';
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript';
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
    return 'text';
  };

  const styles = {
      bg: isDarkMode ? '#1e1e1e' : '#fff',
      border: isDarkMode ? '#333' : '#ddd',
      text: isDarkMode ? '#fff' : '#000',
      tabActive: isDarkMode ? '#333' : '#eee',
      aiBox: isDarkMode ? '#252526' : '#f5f5f5',
  };

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, width: '40%', height: '100%',
      backgroundColor: styles.bg, borderLeft: `2px solid ${styles.border}`, color: styles.text,
      zIndex: 20, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 10px rgba(0,0,0,0.5)'
    }}>
      {/* HEADER */}
      <div style={{ padding: '15px', borderBottom: `1px solid ${styles.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{overflow:'hidden'}}>
           <h3 style={{ margin: 0, fontFamily: 'monospace', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{file?.label}</h3>
        </div>
        <div style={{display:'flex', gap:'5px'}}>
            <button onClick={openGitHub} title="Open original file on GitHub" style={{ background: '#555', color: 'white', border: 'none', cursor: 'pointer', padding: '5px 10px', borderRadius: '4px' }}>
                🔗 GitHub
            </button>
            <button onClick={() => onIsolate(file.id)} title="Focus mode" style={{ background: '#ff9800', color: 'white', border: 'none', cursor: 'pointer', padding: '5px 10px', borderRadius: '4px' }}>
                🎯 Isolate
            </button>
            <button onClick={onClose} style={{ background: '#d32f2f', color: 'white', border: 'none', cursor: 'pointer', padding: '5px 10px', borderRadius: '4px' }}>Close</button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${styles.border}` }}>
          <button onClick={() => setActiveTab('code')} style={{ flex: 1, padding: '10px', background: activeTab === 'code' ? styles.tabActive : 'transparent', color: styles.text, border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>{`</> Code`}</button>
          <button onClick={() => setActiveTab('relations')} style={{ flex: 1, padding: '10px', background: activeTab === 'relations' ? styles.tabActive : 'transparent', color: styles.text, border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>🔗 Connections ({relations.parents.length + relations.children.length})</button>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'code' && (
            <>
                <div style={{padding:'10px', borderBottom:`1px solid ${styles.border}`}}>
                    <button onClick={handleExplain} disabled={loading} style={{ width:'100%', background: '#6200ea', color: 'white', border: 'none', cursor: 'pointer', padding: '10px', borderRadius: '4px', fontWeight:'bold' }}>{loading ? 'Thinking...' : '✨ Explain with AI'}</button>
                    {explanation && (
                        <div style={{ marginTop: '15px', padding: '15px', background: styles.aiBox, borderRadius: '8px', fontSize: '14px', lineHeight: '1.6', border: `1px solid ${styles.border}` }}>
                            <h4 style={{marginTop:0, marginBottom:'10px', color: '#b388ff'}}>🤖 AI Analysis</h4>
                            <ReactMarkdown components={{ strong: ({node, ...props}) => <strong style={{color: isDarkMode ? '#ffeb3b' : '#d32f2f'}} {...props} />, ul: ({node, ...props}) => <ul style={{paddingLeft:'20px', margin:'10px 0'}} {...props} />, li: ({node, ...props}) => <li style={{marginBottom:'5px'}} {...props} /> }}>
                                {explanation}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
                <SyntaxHighlighter language={getLanguage(file?.label)} style={isDarkMode ? vscDarkPlus : vs} showLineNumbers={true} customStyle={{margin:0, height:'100%'}}>{content}</SyntaxHighlighter>
            </>
        )}
        {activeTab === 'relations' && (
            <div style={{ padding: '15px' }}>
                <h4 style={{borderBottom:`1px solid ${styles.border}`, paddingBottom:'5px', color:'#4caf50'}}>⬆️ Used By (Imported In) - {relations.parents.length}</h4>
                <ul style={{listStyle:'none', padding:0}}>
                    {relations.parents.map(node => (
                        <li key={node.id} onClick={() => onSelectNode(node)} style={{padding:'8px', cursor:'pointer', borderBottom:`1px solid ${styles.border}`, fontSize:'13px', display:'flex', alignItems:'center'}}>
                            <span style={{marginRight:'8px'}}>📄</span> {node.data.label}
                        </li>
                    ))}
                </ul>
                <h4 style={{borderBottom:`1px solid ${styles.border}`, paddingBottom:'5px', marginTop:'20px', color:'#2196f3'}}>⬇️ Uses (Imports) - {relations.children.length}</h4>
                <ul style={{listStyle:'none', padding:0}}>
                    {relations.children.map(node => (
                        <li key={node.id} onClick={() => onSelectNode(node)} style={{padding:'8px', cursor:'pointer', borderBottom:`1px solid ${styles.border}`, fontSize:'13px', display:'flex', alignItems:'center'}}>
                            <span style={{marginRight:'8px'}}>📄</span> {node.data.label}
                        </li>
                    ))}
                </ul>
            </div>
        )}
      </div>
    </div>
  );
}