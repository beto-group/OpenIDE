const { useState, useEffect, useRef } = dc;

// --- NODE.JS CORE MODULES ---
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// --- FILE EXPLORER COMPONENTS ---
function FileExplorerItem({ item, depth, onItemSelect, selectedItem }) {
    const [isOpen, setIsOpen] = useState(depth < 1); // Expand the root by default
    const [children, setChildren] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const isFolder = item.isFolder;
    const isSelected = selectedItem && selectedItem.path === item.path;

    const loadChildren = async () => {
        if (!isFolder || children.length > 0) return;
        setIsLoading(true);
        try {
            const listResult = await dc.app.vault.adapter.list(item.path);
            const folderNodes = listResult.folders.map(p => ({ name: path.basename(p), path: p, isFolder: true }));
            const fileNodes = listResult.files.map(p => ({ name: path.basename(p), path: p, isFolder: false }));
            const allNodes = [...folderNodes, ...fileNodes].sort((a, b) => {
                if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            setChildren(allNodes);
        } catch (e) { 
            console.error(`[FileExplorer] Failed to load children for ${item.path}:`, e); 
        } finally { 
            setIsLoading(false); 
        }
    };

    useEffect(() => {
        if (isFolder && isOpen) {
            loadChildren();
        }
    }, [isOpen]);

    const handleExpandToggle = (e) => {
        e.stopPropagation();
        if (isFolder) setIsOpen(prev => !prev);
    };

    const handleSelect = () => {
        onItemSelect(item);
        if (isFolder) {
            setIsOpen(prev => !prev);
        }
    };

    const itemStyle = { 
        display: 'flex', 
        alignItems: 'center', 
        padding: '6px 8px', 
        marginLeft: depth * 20 + 'px', 
        borderRadius: '4px', 
        cursor: 'pointer',
        transition: 'background-color 0.1s ease',
        backgroundColor: isSelected ? 'var(--interactive-accent)' : (isHovering ? 'var(--background-modifier-hover)' : 'transparent'),
        color: isSelected ? 'var(--text-on-accent)' : 'inherit'
    };

    const iconStyle = {
        marginRight: '8px',
        width: '18px',
        height: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isSelected ? 'var(--text-on-accent)' : 'var(--text-muted)',
    };

    const nameStyle = { flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '14px' };

    const folderIcon = isOpen ? 'folder-open' : 'folder';
    const fileIcon = 'file';
    const arrowIcon = isOpen ? 'chevron-down' : 'chevron-right';

    return (
        <div>
            <div 
                style={itemStyle} 
                title={item.path}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                onClick={handleSelect}
            >
                {isFolder && (
                    <span style={iconStyle} onClick={handleExpandToggle}>
                        <dc.Icon icon={arrowIcon} style={{ fontSize: '12px' }} />
                    </span>
                )}
                <span style={iconStyle}>
                    <dc.Icon icon={isFolder ? folderIcon : fileIcon} style={{ fontSize: '16px' }} />
                </span>
                <span style={nameStyle}>{item.name}</span>
            </div>
            {isFolder && isOpen && (
                isLoading ? <div style={{ paddingLeft: (depth + 1) * 20 + 52 + 'px', color: 'var(--text-muted)', fontSize: '12px' }}>Loading...</div> :
                children.map(child => <FileExplorerItem key={child.path} item={child} depth={depth + 1} onItemSelect={onItemSelect} selectedItem={selectedItem} />)
            )}
        </div>
    );
}

function FileExplorerView({ rootPath = '', onItemSelect, selectedItem }) {
    const [rootItem, setRootItem] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchRoot = async () => {
            setError(null);
            setRootItem(null);
            try {
                const exists = await dc.app.vault.adapter.exists(rootPath);
                if (!exists) {
                    setError(`Path '${rootPath}' does not exist.`);
                    return;
                }
                const stat = await dc.app.vault.adapter.stat(rootPath);
                const isFolder = stat.type === 'folder';
                if (!isFolder) {
                    setError(`Path '${rootPath}' is not a folder.`);
                    return;
                }
                const root = { name: path.basename(rootPath) || rootPath, path: rootPath, isFolder: true };
                setRootItem(root);
                if (!selectedItem) {
                    onItemSelect(root);
                }
            } catch (e) {
                console.error(`[FileExplorer] Error setting up root '${rootPath}':`, e);
                setError("Failed to initialize file explorer.");
            }
        };
        fetchRoot();
    }, [rootPath]);

    const explorerStyles = {
        wrapper: { flex: 1, minHeight: 0, width: "100%", background: 'transparent', color: 'var(--text-normal)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
        content: { padding: '8px', flex: 1, overflowY: 'auto' }
    };

    return (
        <div style={explorerStyles.wrapper}>
            <div style={explorerStyles.content}>
                {error && <p style={{ color: 'var(--text-error)' }}>{error}</p>}
                {rootItem ? <FileExplorerItem item={rootItem} depth={0} onItemSelect={onItemSelect} selectedItem={selectedItem} /> : <p>Loading...</p>}
            </div>
        </div>
    );
}

// --- MAIN COMPONENT ---
function OpenIDEView({ onExit }) {
    const [selectedItem, setSelectedItem] = useState(null);
    const [ideCommand, setIdeCommand] = useState('');
    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const [promptConfig, setPromptConfig] = useState(null);
    const [promptValues, setPromptValues] = useState([]);
    const uniqueWrapperClass = "openide-wrapper-" + Math.random().toString(36).substr(2, 9);

    const vaultPath = useRef(path.normalize(dc.app.vault.adapter.getBasePath())).current;

    const IDE_COMMAND_KEY = 'openIde_ideCommand';
    const getIdeCommand = () => localStorage.getItem(IDE_COMMAND_KEY);
    const saveIdeCommand = (cmd) => localStorage.setItem(IDE_COMMAND_KEY, cmd);

    useEffect(() => {
        const cmd = getIdeCommand();
        if (cmd) setIdeCommand(cmd);
    }, []);

    const handleItemSelect = (item) => {
        setSelectedItem(item);
    };

    const promptForIdeCommand = () => {
        const currentCmd = getIdeCommand() || '';
        setPromptValues([currentCmd]);
        setPromptConfig({
            title: "Configure Your Code Editor",
            description: "Enter the command to launch your preferred code editor (e.g., 'code' for VS Code, 'cursor', 'subl' for Sublime, etc.).",
            inputs: [{ label: "Editor Command", placeholder: "code", value: currentCmd }],
            onSubmit: (values) => {
                const [cmd] = values;
                setIdeCommand(cmd);
                saveIdeCommand(cmd);
            }
        });
        setIsPromptOpen(true);
    };

    const handleOpenInIde = () => {
        if (!selectedItem) {
            new Notice("Please select a file or folder first.");
            return;
        }
        const cmd = getIdeCommand();
        if (!cmd) {
            promptForIdeCommand();
            return;
        }

        const fullPath = path.join(vaultPath, selectedItem.path);
        if (!fs.existsSync(fullPath)) {
            new Notice(`Path not found: ${fullPath}`, 8000);
            return;
        }

        const platform = os.platform();
        let command;
        let args;
        const isTerminalEditor = ['nvim', 'neovim', 'vim'].includes(cmd.toLowerCase());

        if (isTerminalEditor) {
            if (platform === 'win32') {
                command = 'cmd';
                args = ['/c', 'start', 'cmd', '/k', `${cmd} "${fullPath}"`];
            } else {
                command = '/bin/sh';
                args = ['-c', `${cmd} "${fullPath}"`];
            }
        } else {
            const commandString = `${cmd} "${fullPath}"`;
            if (platform === 'win32') {
                command = 'cmd';
                args = ['/c', 'start', '', cmd, `"${fullPath}"`];
            } else {
                command = '/bin/sh';
                args = ['-l', '-c', commandString];
            }
        }

        const options = {
            detached: !isTerminalEditor,
            stdio: 'ignore',
            shell: platform === 'win32' || isTerminalEditor,
        };

        new Notice(`Opening ${selectedItem.path} in ${cmd}...`, 3000);

        const proc = spawn(command, args, options);

        proc.on('error', (err) => {
            console.error("[OpenIDE] Process spawn failed.", err);
            let errorMsg = `Failed to open path in ${cmd}. `;
            if (platform === 'darwin' && cmd === 'code') {
                errorMsg += 'Make sure VS Code is installed. Try installing the "code" command: Cmd+Shift+P → "Shell Command: Install \'code\' command in PATH"';
            } else {
                errorMsg += 'Check console for details.';
            }
            new Notice(errorMsg, 10000);
        });

        if (!isTerminalEditor) {
            proc.unref();
        }
    };

    const handlePromptChange = (index, value) => { const newValues = [...promptValues]; newValues[index] = value; setPromptValues(newValues); };
    const handlePromptSubmit = () => { if (promptConfig?.onSubmit) promptConfig.onSubmit(promptValues); handlePromptClose(); };
    const handlePromptClose = () => { setIsPromptOpen(false); setPromptConfig(null); setPromptValues([]); };

    const STYLES = {
        wrapper: { backgroundColor: 'var(--background-primary)', color: 'var(--text-normal)', fontFamily: 'var(--font-interface)', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', position: 'relative' },
        exitIcon: { position: "absolute", top: "15px", right: "20px", color: 'var(--text-muted)', cursor: "pointer", transition: "opacity 0.2s", zIndex: 10000, backgroundColor: 'var(--background-secondary)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
        header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--background-modifier-border)', flexShrink: 0 },
        button: { padding: '10px 18px', fontSize: '14px', fontWeight: '500', backgroundColor: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
        buttonSecondary: { padding: '10px 18px', fontSize: '14px', fontWeight: '500', backgroundColor: 'var(--background-modifier-hover)', color: 'var(--text-muted)', border: '1px solid var(--background-modifier-border)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
        section: { flex: 1, overflowY: 'hidden', padding: '24px', display: 'flex', flexDirection: 'row', gap: '20px', minHeight: 0 },
        explorerContainer: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--background-secondary)', borderRadius: '8px', border: '1px solid var(--background-modifier-border)', padding: '16px', minHeight: 0 },
        configPanel: { width: '350px', display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: 'var(--background-secondary)', borderRadius: '8px', border: '1px solid var(--background-modifier-border)', padding: '20px' },
        selectedFileDisplay: { padding: '16px', backgroundColor: 'var(--background-primary)', borderRadius: '8px', border: '1px solid var(--background-modifier-border)' },
        actions: { display: 'flex', flexDirection: 'column', gap: '12px' },
        ideConfig: { display: 'flex', flexDirection: 'column', gap: '8px' },
        ideDisplay: { padding: '12px', backgroundColor: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '14px' },
        modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 },
        modalContent: { backgroundColor: 'var(--background-secondary)', padding: '24px', borderRadius: '8px', border: '1px solid var(--background-modifier-border)', width: '500px', maxWidth: '90vw' },
        modalTitle: { fontSize: '1.5em', margin: 0, marginBottom: '16px' },
        input: { width: '100%', padding: '12px', boxSizing: 'border-box', backgroundColor: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '6px', color: 'var(--text-normal)', marginBottom: '16px' },
        inputGroup: { display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }
    };

    return (
        <div className={uniqueWrapperClass} style={STYLES.wrapper}>
            <button style={STYLES.exitIcon} className="openide-exit-icon" onClick={onExit} title="Minimize Editor">
                <dc.Icon icon="minimize-2" style={{ width: '14px', height: '14px' }} />
            </button>
            <div style={STYLES.header}>
                <h1 style={{ margin: 0, color: 'var(--text-normal)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px' }}>
                    <dc.Icon icon="code" style={{ width: '22px', height: '22px', color: 'var(--interactive-accent)' }} />
                    Open in IDE
                </h1>
            </div>
            <div style={STYLES.section}>
                <div style={STYLES.explorerContainer}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                        <dc.Icon icon="folder" style={{ width: '18px', height: '18px', color: 'var(--interactive-accent)' }} />
                        File Explorer
                    </h3>
                    <FileExplorerView rootPath="" onItemSelect={handleItemSelect} selectedItem={selectedItem} />
                </div>
                <div style={STYLES.configPanel}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                        <dc.Icon icon="settings" style={{ width: '18px', height: '18px', color: 'var(--interactive-accent)' }} />
                        IDE Configuration
                    </h3>
                    {selectedItem && (
                        <div style={STYLES.selectedFileDisplay}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <dc.Icon icon={selectedItem.isFolder ? 'folder' : 'file'} style={{ width: '16px', height: '16px' }} />
                                <strong>Selected {selectedItem.isFolder ? 'Folder' : 'File'}:</strong>
                            </div>
                            <code style={{ fontSize: '13px', wordBreak: 'break-all', color: 'var(--text-muted)' }}>{selectedItem.path}</code>
                        </div>
                    )}
                    <div style={STYLES.ideConfig}>
                        <label style={{ fontWeight: '500', marginBottom: '4px', fontSize: '13px' }}>Current IDE Command:</label>
                        <div style={STYLES.ideDisplay}>
                            {ideCommand || 'Not configured'}
                        </div>
                    </div>
                    <div style={STYLES.actions}>
                        <button style={STYLES.button} onClick={handleOpenInIde} disabled={!selectedItem}>
                            <dc.Icon icon="play" style={{ width: '14px', height: '14px' }} />
                            Launch Editor
                        </button>
                        <button style={STYLES.buttonSecondary} onClick={promptForIdeCommand}>
                            <dc.Icon icon="settings" style={{ width: '14px', height: '14px' }} />
                            Configure IDE
                        </button>
                    </div>
                </div>
            </div>
            {isPromptOpen && (
                <div style={STYLES.modalOverlay} onClick={handlePromptClose}>
                    <div style={STYLES.modalContent} onClick={e => e.stopPropagation()}>
                        <h2 style={STYLES.modalTitle}>{promptConfig.title}</h2>
                        <p style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>{promptConfig.description}</p>
                        <div style={STYLES.inputGroup}>
                            {promptConfig.inputs.map((input, index) => (
                                <div key={index}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '13px' }}>{input.label}</label>
                                    <input
                                        type="text"
                                        style={STYLES.input}
                                        placeholder={input.placeholder}
                                        value={promptValues[index] || ''}
                                        onChange={(e) => handlePromptChange(index, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button style={STYLES.buttonSecondary} onClick={handlePromptClose}>Cancel</button>
                            <button style={STYLES.button} onClick={handlePromptSubmit}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

return { OpenIDEView };
