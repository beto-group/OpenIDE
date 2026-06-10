# OpenIDE Contribution Guidelines

Thank you for contributing to **OpenIDE**. To ensure the component loads reliably in Datacore’s sandboxed environment, all modifications must strictly adhere to the project standards:

## Code Rules
1. **Zero ES Module Syntax**: Do **not** use `export` or `import` keywords anywhere. Evaluated scripts will crash with a `SyntaxError` at runtime.
2. **Module Registration**: Ensure every script file ends with an explicit object return statement, e.g. `return { MyComponent };`.
3. **No Hardcoded Absolute Colors**: Use Obsidian CSS theme variables (such as `var(--interactive-accent)`, `var(--background-primary)`) to preserve native light/dark compatibility.
4. **Lucide Icons Only**: Do not use raw OS emojis in the UI. Always use `<dc.Icon icon="..." />`.
5. **Vault Path Resolving**: Always use `dc.resolvePath` to target local assets/caches instead of generating loose folders in the vault root.
