---
cssclasses:
  - bfv-container
  - fulltab-610-openide
---

```datacorejsx
try {
    const activeFile = dc.resolvePath("OPEN IDE") || "_RESOURCES/DATACORE/_DONE/OPEN IDE/OPEN IDE.md";
    const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));
    
    const { View } = await dc.require(folderPath + "/src/index.jsx");
    return <View folderPath={folderPath} />;
} catch (e) {
    return (
        <div style={{ color: 'var(--text-error, red)', padding: '20px', background: 'var(--background-secondary)', zIndex: 100000, position: 'relative', fontFamily: 'monospace' }}>
            <h3>Datacore Load Error</h3>
            <pre>{e.stack || e.message || String(e)}</pre>
        </div>
    );
}
```
