---
cssclasses:
  - bfv-container
  - fulltab-610-openide
---

```datacorejsx
const { View } = await dc.require(dc.resolvePath("OPEN IDE/src/index.jsx"));
return <View folderPath={dc.resolvePath("OPEN IDE")} />;
```
