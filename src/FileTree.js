import React, { useState } from 'react';

const FileTreeNode = ({ node, depth, isDarkMode }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isFolder = node.type === 'folder';
  const paddingLeft = `${depth * 15}px`;
  const textColor = isDarkMode ? '#ccc' : '#333';
  const folderColor = isDarkMode ? '#fff' : '#000';

  if (!isFolder) {
    return (
      <div style={{ paddingLeft, paddingBottom: '4px', display: 'flex', alignItems: 'center', color: textColor, fontSize: '13px' }}>
        <span style={{ marginRight: '5px' }}>📄</span> {node.name}
      </div>
    );
  }

  return (
    <div>
      <div 
        onClick={() => setIsExpanded(!isExpanded)} 
        style={{ 
            paddingLeft, cursor: 'pointer', paddingBottom: '4px', 
            fontWeight: 'bold', color: folderColor, fontSize: '13px', 
            display: 'flex', alignItems: 'center' 
        }}
      >
        <span style={{ marginRight: '5px' }}>{isExpanded ? '📂' : '📁'}</span> {node.name}
      </div>
      
      {isExpanded && node.children.map((child, index) => (
        <FileTreeNode key={index} node={child} depth={depth + 1} isDarkMode={isDarkMode} />
      ))}
    </div>
  );
};

export default function FileTree({ data, onClose, isDarkMode }) {
  if (!data) return null;

  const bg = isDarkMode ? '#1e1e1e' : '#f8f9fa';
  const border = isDarkMode ? '#444' : '#ddd';
  const text = isDarkMode ? '#fff' : '#000';

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '250px', height: '100%',
      backgroundColor: bg, borderRight: `1px solid ${border}`,
      zIndex: 20, display: 'flex', flexDirection: 'column',
      boxShadow: '4px 0 10px rgba(0,0,0,0.5)', overflow: 'hidden'
    }}>
      <div style={{ padding: '15px', borderBottom: `1px solid ${border}`, background: isDarkMode ? '#252526' : '#eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: text, fontSize: '14px', textTransform:'uppercase' }}>Explorer</h3>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize:'16px' }}>✖</button>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        <FileTreeNode node={data} depth={0} isDarkMode={isDarkMode} />
      </div>
    </div>
  );
}