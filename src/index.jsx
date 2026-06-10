/**
 * OpenIDE Bootstrapper
 * Implements Safe Agent recovery, FullTab view hijacking, and stylesheet overlays.
 */
function View({ folderPath }) {
    const { useState, useEffect, useRef } = dc;

    // 1. Initialize Safe Agent immediately
    const Agent = {
        timer: null,
        start: (fPath, onReload) => {
            if (Agent.timer) clearInterval(Agent.timer);
            const cmdFile = fPath + "/data/mcp_commands.json";

            Agent.timer = setInterval(async () => {
                try {
                    const adapter = dc.app.vault.adapter;
                    if (!(await adapter.exists(cmdFile))) return;

                    const content = await adapter.read(cmdFile);
                    let cmd;
                    try { cmd = JSON.parse(content); } catch (e) { return; }

                    if (cmd && cmd.executed === false) {
                        if (cmd.action === "reload") {
                            cmd.executed = true;
                            cmd.result = "Executed";
                            cmd.executedAt = new Date().toISOString();
                            await adapter.write(cmdFile, JSON.stringify(cmd, null, 2));
                            onReload();
                        }
                    }
                } catch (e) { console.error("[SafeAgent] Error", e); }
            }, 1000);
            return () => clearInterval(Agent.timer);
        }
    };

    const SafeRoot = () => {
        const [app, setApp] = useState(null);
        const [error, setError] = useState(null);
        const [key, setKey] = useState(0);

        useEffect(() => {
            const stopAgent = Agent.start(folderPath, () => {
                if (dc.app.workspace.activeLeaf?.rebuildView) {
                    dc.app.workspace.activeLeaf.rebuildView();
                } else {
                    setKey(k => k + 1);
                }
            });
            return stopAgent;
        }, []);

        useEffect(() => {
            const load = async () => {
                try {
                    const { OpenIDEView } = await dc.require(folderPath + "/src/App.jsx");
                    setApp({ OpenIDEView });
                } catch (e) {
                    console.error("Open IDE Load Error:", e);
                    setError(e);
                }
            };
            load();
        }, [key]);

        if (error) {
            return (
                <div style={{ color: 'var(--text-error, #ff4444)', padding: '40px', backgroundColor: 'var(--background-primary)', height: '100%', fontFamily: 'monospace' }}>
                    <h2 style={{ fontWeight: 900 }}>OPEN IDE LOAD ERROR</h2>
                    <pre style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{error.stack}</pre>
                    <button 
                        onClick={() => { setError(null); setKey(k => k + 1); }} 
                        style={{ padding: '12px 24px', backgroundColor: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', fontWeight: 700, borderRadius: '4px', cursor: 'pointer' }}
                    >
                        RETRY PROTOCOL
                    </button>
                </div>
            );
        }

        if (!app) {
            return (
                <div style={{ 
                    backgroundColor: 'var(--background-primary)', 
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: 'var(--interactive-accent)',
                    fontFamily: 'monospace',
                    fontSize: '13px'
                }}>
                    INITIALIZING_OPEN_IDE_PROTOCOL...
                </div>
            );
        }

        const { OpenIDEView } = app;
        return <FullTabWrapper OpenIDEView={OpenIDEView} key={key} />;
    };

    const FullTabWrapper = ({ OpenIDEView }) => {
        const [isFullTab, setIsFullTab] = useState(true);
        const [hijacked, setHijacked] = useState(false);
        const rootRef = useRef(null);
        const stateRefs = useRef({}).current;
        const componentId = useRef('openide-' + Math.random().toString(36).substr(2, 5)).current;

        useEffect(() => {
            if (!isFullTab) {
                setHijacked(false);
                return;
            }

            const container = rootRef.current;
            if (!container) return;

            let poller;
            let attempts = 0;

            const tryHijack = () => {
                // 1. Locate nearest leaf content wrapper
                const leaf = container.closest('.workspace-leaf-content') || container.closest('.workspace-leaf');
                if (!leaf) return false;

                // 2. Select the view-content container below the header
                const contentWrapper = leaf.querySelector(':scope > .view-content') || leaf.querySelector('.view-content') || leaf;
                const currentParent = container.parentNode;
                if (!currentParent || currentParent === contentWrapper) return false;

                // 3. Setup placeholder in standard DOM layout
                stateRefs.originalParent = currentParent;
                const placeholder = document.createElement("div");
                placeholder.style.display = "none";
                if (container.nextSibling) {
                    currentParent.insertBefore(placeholder, container.nextSibling);
                } else {
                    currentParent.appendChild(placeholder);
                }
                stateRefs.placeholder = placeholder;

                // 4. Inject impeccable status bar suppression stylesheet
                const styleId = `impeccable-status-${componentId}`;
                let styleEl = document.getElementById(styleId);
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = styleId;
                    styleEl.innerHTML = `
                        /* Hide global status bar and view footers */
                        .status-bar, .view-footer, .workspace-leaf-content-footer { 
                            display: none !important; 
                        }
                        
                        /* Expand workspace-leaf-content to edge-to-edge container */
                        .workspace-leaf-content { 
                            padding: 0 !important; 
                            margin: 0 !important; 
                            border-radius: 0 !important; 
                        }
                    `;
                    document.head.appendChild(styleEl);
                }

                stateRefs.parentPositionInfo = {
                    element: contentWrapper,
                    originalInlinePosition: contentWrapper.style.position,
                };

                if (window.getComputedStyle(contentWrapper).position === 'static') {
                    contentWrapper.style.position = "relative";
                }

                // 5. Append component to view-content
                contentWrapper.appendChild(container);

                requestAnimationFrame(() => {
                    Object.assign(contentWrapper.style, {
                        padding: "0",
                        margin: "0",
                        height: "100%",
                        width: "100%",
                        display: "block",
                        overflow: "hidden"
                    });
                });

                Object.assign(container.style, {
                    position: "absolute",
                    top: "0",
                    left: "0",
                    width: "100%",
                    height: "100%",
                    zIndex: "9998",
                    overflow: "hidden",
                    backgroundColor: "var(--background-primary)",
                    display: "flex",
                    flexDirection: "column",
                    visibility: "visible",
                });
                setHijacked(true);
                return true;
            };

            // Run first try
            if (!tryHijack()) {
                poller = setInterval(() => {
                    attempts++;
                    if (tryHijack() || attempts > 100) {
                        clearInterval(poller);
                    }
                }, 16);
            }

            // 6. Graceful cleanup on unmount or fulltab minimize toggle
            return () => {
                if (poller) clearInterval(poller);

                if (stateRefs.placeholder?.parentNode) {
                    stateRefs.placeholder.parentNode.replaceChild(container, stateRefs.placeholder);
                } else if (stateRefs.originalParent) {
                    stateRefs.originalParent.appendChild(container);
                }

                const styleId = `impeccable-status-${componentId}`;
                const el = document.getElementById(styleId);
                if (el) el.remove();

                if (stateRefs.parentPositionInfo?.element) {
                    const { element, originalInlinePosition } = stateRefs.parentPositionInfo;
                    element.style.position = originalInlinePosition || '';
                    element.style.padding = '';
                    element.style.margin = '';
                    element.style.height = '';
                    element.style.width = '';
                    element.style.overflow = '';
                }

                container.removeAttribute("style");
                setHijacked(false);
            };
        }, [isFullTab]);

        if (isFullTab) {
            return (
                <div 
                    ref={rootRef}
                    style={{
                        width: '100%',
                        height: '100%',
                        visibility: hijacked ? 'visible' : 'hidden',
                    }}
                >
                    <OpenIDEView onExit={() => setIsFullTab(false)} />
                </div>
            );
        }

        return (
            <div style={{ padding: '30px', backgroundColor: 'var(--background-secondary)', borderRadius: '8px', border: '1px solid var(--background-modifier-border)', textAlign: 'center' }}>
                <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted)', fontSize: '14px' }}>Open IDE Component is currently minimized.</p>
                <button 
                    onClick={() => setIsFullTab(true)}
                    style={{ padding: '8px 16px', backgroundColor: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    Restore View
                </button>
            </div>
        );
    };

    return <SafeRoot />;
}

return { View };
