# OpenIDE Integration Example

To run the visual code editor launcher on a custom workspace page:

1. Create a new markdown file (e.g. `Launcher.md`).
2. Add the `bfv-container` frontmatter layout classes to make it full-pane.
3. Insert the standard `datacorejsx` rendering code block.

### Example Note Template

```markdown
---
cssclasses:
  - bfv-container
  - fulltab-610-openide
---

\`\`\`datacorejsx
const activeFile = dc.resolvePath("OPEN IDE") || "_RESOURCES/DATACORE/_DONE/OPEN IDE/OPEN IDE.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

const { View } = await dc.require(folderPath + "/src/index.jsx");
return <View folderPath={folderPath} />;
\`\`\`
```
