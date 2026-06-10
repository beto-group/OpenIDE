/**
 * OpenIDE Bootstrapper
 * Implements Safe Agent recovery, FullTab view hijacking, and stylesheet overlays.
 */
async function View({ folderPath }) {
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

        const FULLTAB_ID = 'fulltab-610-openide';

        // Layer 1 — CSS suppression
        useEffect(() => {
            if (!isFullTab) return;
            let styleEl = document.getElementById(FULLTAB_ID);
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = FULLTAB_ID;
                styleEl.innerHTML = `
                    body > .app-container .status-bar,
                    .status-bar,
                    .inline-title,
                    .view-footer,
                    .workspace-leaf-content-footer,
                    .mod-footer,
                    .embedded-backlinks {
                        display: none !important;
                    }
                    .workspace-leaf-content,
                    .markdown-preview-view,
                    .cm-scroller {
                        overflow: hidden !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        border-radius: 0 !important;
                    }
                    .markdown-preview-section {
                        padding: 0 !important;
                        max-width: 100% !important;
                    }
                    .markdown-preview-sizer {
                        padding: 0 !important;
                        margin: 0 auto !important;
                        min-height: unset !important;
                    }
                `;
                document.head.appendChild(styleEl);
            }
            return () => {
                const el = document.getElementById(FULLTAB_ID);
                if (el) el.remove();
            };
        }, [isFullTab]);

        // Layer 2 — DOM reparenting
        useEffect(() => {
            if (!isFullTab) {
                setHijacked(false);
                return;
            }
            const root = rootRef.current;
            if (!root) return;

            let attempts = 0;
            const hijack = () => {
                try {
                    const leaf = root.closest('.workspace-leaf');
                    const scroller = leaf?.querySelector('.cm-scroller') || leaf?.querySelector('.markdown-preview-view');
                    if (scroller) {
                        scroller.appendChild(root);
                        Object.assign(root.style, {
                            position: 'absolute',
                            top: '0', left: '0',
                            width: '100%', height: '100%',
                            zIndex: '10',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            visibility: 'visible',
                        });
                        setHijacked(true);
                        return true;
                    }
                } catch (e) { }
                return false;
            };

            if (hijack()) return;

            const poller = setInterval(() => {
                if (hijack() || attempts++ > 100) clearInterval(poller);
            }, 16);

            return () => clearInterval(poller);
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
