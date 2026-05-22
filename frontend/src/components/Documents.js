import React, { useState, useEffect, useCallback } from 'react';
import { documentAPI, messageAPI } from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

function previewKind(fileName) {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return 'image';
    return null;
}

const Documents = () => {
    const [documents, setDocuments] = useState([]);
    const [folders, setFolders] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadFolderId, setUploadFolderId] = useState('');
    const [sharePick, setSharePick] = useState({});
    const [movePick, setMovePick] = useState({});
    const [preview, setPreview] = useState(null);
    const [selectedView, setSelectedView] = useState('all');
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const [creatingFolder, setCreatingFolder] = useState(false);

    useEffect(() => {
        return () => {
            if (preview?.url) URL.revokeObjectURL(preview.url);
        };
    }, [preview]);

    const closePreview = () => setPreview(null);

    useEffect(() => {
        const t = setTimeout(() => setSearchQuery(searchInput), 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    const loadDirectory = useCallback(async () => {
        try {
            const res = await messageAPI.getAllUsers();
            setAllUsers(res.data);
        } catch (err) {
            console.error(err);
        }
    }, []);

    const loadFolders = useCallback(async () => {
        try {
            const res = await documentAPI.listFolders();
            setFolders(res.data);
        } catch (err) {
            console.error(err);
        }
    }, []);

    const docQueryParams = useCallback(() => {
        const params = {};
        if (selectedView === 'unfiled') params.folder = 'unfiled';
        else if (selectedView === 'shared') params.folder = 'shared';
        else if (selectedView !== 'all') params.folder = String(selectedView);
        if (searchQuery.trim()) params.q = searchQuery.trim();
        return params;
    }, [selectedView, searchQuery]);

    const loadDocuments = useCallback(async () => {
        try {
            setLoading(true);
            const response = await documentAPI.getAll(docQueryParams());
            setDocuments(response.data);
            setError('');
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load documents'));
        } finally {
            setLoading(false);
        }
    }, [docQueryParams]);

    useEffect(() => {
        loadDocuments();
    }, [loadDocuments]);

    useEffect(() => {
        loadFolders();
        loadDirectory();
    }, [loadFolders, loadDirectory]);

    const handleFileSelect = (e) => {
        setSelectedFile(e.target.files[0]);
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!selectedFile) {
            setError('Please select a file');
            return;
        }

        const formData = new FormData();
        formData.append('document', selectedFile);
        if (uploadFolderId) {
            formData.append('folderId', uploadFolderId);
        }

        try {
            setUploading(true);
            await documentAPI.upload(formData);
            setSelectedFile(null);
            document.getElementById('fileInput').value = '';
            await loadDocuments();
            await loadFolders();
            setError('');
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to upload document'));
        } finally {
            setUploading(false);
        }
    };

    const handleCreateFolder = async (e) => {
        e.preventDefault();
        const name = newFolderName.trim();
        if (!name) return;
        setCreatingFolder(true);
        setError('');
        try {
            await documentAPI.createFolder(name);
            setNewFolderName('');
            await loadFolders();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to create folder'));
        } finally {
            setCreatingFolder(false);
        }
    };

    const handleDeleteFolder = async (folderId, folderLabel) => {
        if (!window.confirm(`Delete folder “${folderLabel}”? Files inside will move to Unfiled.`)) return;
        try {
            await documentAPI.deleteFolder(folderId);
            if (String(selectedView) === String(folderId)) {
                setSelectedView('all');
            }
            await loadFolders();
            await loadDocuments();
            setError('');
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to delete folder'));
        }
    };

    const handleMoveDocument = async (docId) => {
        const raw = movePick[docId];
        const folderId = raw === '' || raw === undefined ? null : parseInt(raw, 10);
        try {
            await documentAPI.moveToFolder(docId, folderId);
            setMovePick((p) => {
                const next = { ...p };
                delete next[docId];
                return next;
            });
            setError('');
            await loadDocuments();
            await loadFolders();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to move file'));
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this document?')) {
            try {
                await documentAPI.delete(id);
                await loadDocuments();
                setError('');
            } catch (err) {
                setError(getApiErrorMessage(err, 'Failed to delete document'));
            }
        }
    };

    const handleRevokeShare = async (shareId) => {
        if (!window.confirm('Remove this file from your shared list? The owner keeps their copy.')) return;
        try {
            await documentAPI.revokeShare(shareId);
            await loadDocuments();
            setError('');
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to remove share'));
        }
    };

    const handleShare = async (docId) => {
        const raw = sharePick[docId];
        const userId = parseInt(raw, 10);
        if (!userId) {
            setError('Choose someone to share with.');
            return;
        }
        try {
            await documentAPI.share(docId, userId);
            setSharePick((p) => ({ ...p, [docId]: '' }));
            setError('');
            await loadDocuments();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to share document'));
        }
    };

    const handleDownload = async (id, fileName) => {
        try {
            setError('');
            const response = await documentAPI.download(id);
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to download document'));
        }
    };

    const handlePreview = async (doc) => {
        const kind = previewKind(doc.file_name);
        if (!kind) {
            setError('Preview is available for PDF and image files only.');
            return;
        }
        try {
            setError('');
            const response = await documentAPI.download(doc.id);
            const blob = new Blob([response.data]);
            const url = window.URL.createObjectURL(blob);
            setPreview({ url, kind, title: doc.file_name });
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to open preview'));
        }
    };

    return (
        <div className="documents-container">
            <div className="documents-header">
                <h1>Secure Document Vault</h1>
                <p>Upload files encrypted for your account; share with peers using a recipient-specific re-encrypted copy.</p>
            </div>

            <div className="vault-folder-bar card-surface">
                <div className="vault-folder-bar-row">
                    <span className="vault-folder-bar-label">Browse</span>
                    <div className="vault-folder-chips">
                        <button
                            type="button"
                            className={`vault-folder-chip ${selectedView === 'all' ? 'is-active' : ''}`}
                            onClick={() => setSelectedView('all')}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            className={`vault-folder-chip ${selectedView === 'unfiled' ? 'is-active' : ''}`}
                            onClick={() => setSelectedView('unfiled')}
                        >
                            Unfiled
                        </button>
                        <button
                            type="button"
                            className={`vault-folder-chip ${selectedView === 'shared' ? 'is-active' : ''}`}
                            onClick={() => setSelectedView('shared')}
                        >
                            Shared with you
                        </button>
                        {folders.map((f) => (
                            <span key={f.id} className="vault-folder-chip-wrap">
                                <button
                                    type="button"
                                    className={`vault-folder-chip ${String(selectedView) === String(f.id) ? 'is-active' : ''}`}
                                    onClick={() => setSelectedView(String(f.id))}
                                >
                                    📁 {f.name}
                                </button>
                                <button
                                    type="button"
                                    className="vault-folder-delete"
                                    title={`Delete folder ${f.name}`}
                                    aria-label={`Delete folder ${f.name}`}
                                    onClick={() => handleDeleteFolder(f.id, f.name)}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
                <div className="vault-search-row">
                    <label htmlFor="vault-search" className="sr-only">
                        Search by file name
                    </label>
                    <input
                        id="vault-search"
                        type="search"
                        className="vault-search-input"
                        placeholder="Search by file name…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        autoComplete="off"
                    />
                </div>
                <form className="vault-new-folder-form" onSubmit={handleCreateFolder}>
                    <input
                        type="text"
                        placeholder="New folder (e.g. CSE 447)"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        maxLength={255}
                    />
                    <button type="submit" disabled={creatingFolder || !newFolderName.trim()}>
                        {creatingFolder ? 'Adding…' : 'Add folder'}
                    </button>
                </form>
            </div>

            <div className="upload-section">
                <h3>Upload New Document</h3>
                <form onSubmit={handleUpload}>
                    <input
                        type="file"
                        id="fileInput"
                        onChange={handleFileSelect}
                        accept=".pdf,.doc,.docx,.txt,.jpg,.png"
                    />
                    <div className="vault-upload-folder-row">
                        <label htmlFor="upload-folder">Save to folder</label>
                        <select
                            id="upload-folder"
                            value={uploadFolderId}
                            onChange={(e) => setUploadFolderId(e.target.value)}
                        >
                            <option value="">Unfiled</option>
                            {folders.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button type="submit" disabled={uploading}>
                        {uploading ? 'Encrypting & Uploading...' : 'Upload (encrypted)'}
                    </button>
                </form>
                {error && (
                    <div className="error" role="alert">
                        {error}
                    </div>
                )}
            </div>

            <div className="documents-list">
                <h3>Your documents</h3>
                {loading && <div className="loading">Loading documents...</div>}

                {documents.length === 0 && !loading && (
                    <div className="no-documents">
                        <p>No documents yet.</p>
                        <p>Upload a file or ask a teammate to share one with you.</p>
                    </div>
                )}

                <div className="documents-grid">
                    {documents.map((doc) => (
                        <div
                            key={`${doc.access}-${doc.id}-${doc.shareId ?? 'o'}`}
                            className="document-card"
                        >
                            <div className="document-icon">
                                {doc.file_name.endsWith('.pdf') ? '📄' :
                                 doc.file_name.endsWith('.doc') || doc.file_name.endsWith('.docx') ? '📝' :
                                 doc.file_name.endsWith('.txt') ? '📃' :
                                 doc.file_name.endsWith('.jpg') || doc.file_name.endsWith('.png') ? '🖼️' : '📎'}
                            </div>
                            <div className="document-info">
                                <h4>{doc.file_name}</h4>
                                <small>Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}</small>
                                <div className={`doc-access-badge ${doc.access === 'shared' ? 'doc-access-shared' : 'doc-access-owned'}`}>
                                    {doc.access === 'shared' ? 'Shared with you' : 'Owned by you'}
                                </div>
                                {doc.access === 'owned' && doc.folderName && (
                                    <div className="doc-folder-badge">📂 {doc.folderName}</div>
                                )}
                                <div className="security-badge">🔒 AES-GCM envelope + HMAC</div>
                            </div>
                            <div className="document-actions">
                                {previewKind(doc.file_name) && (
                                    <button
                                        type="button"
                                        onClick={() => handlePreview(doc)}
                                        className="preview-btn"
                                    >
                                        Preview
                                    </button>
                                )}
                                <button type="button" onClick={() => handleDownload(doc.id, doc.file_name)} className="download-btn">
                                    Download
                                </button>
                                {doc.access === 'owned' && (
                                    <>
                                        <div className="document-move-row">
                                            <label htmlFor={`move-${doc.id}`} className="sr-only">
                                                Move to folder
                                            </label>
                                            <select
                                                id={`move-${doc.id}`}
                                                value={
                                                    movePick[doc.id] !== undefined
                                                        ? movePick[doc.id]
                                                        : doc.folderId != null
                                                          ? String(doc.folderId)
                                                          : ''
                                                }
                                                onChange={(e) =>
                                                    setMovePick((p) => ({ ...p, [doc.id]: e.target.value }))
                                                }
                                            >
                                                <option value="">Unfiled</option>
                                                {folders.map((f) => (
                                                    <option key={f.id} value={f.id}>
                                                        {f.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                className="move-folder-btn"
                                                onClick={() => handleMoveDocument(doc.id)}
                                            >
                                                Move
                                            </button>
                                        </div>
                                        <div className="document-share-row">
                                            <label htmlFor={`share-${doc.id}`} className="sr-only">Share with</label>
                                            <select
                                                id={`share-${doc.id}`}
                                                value={sharePick[doc.id] || ''}
                                                onChange={(e) =>
                                                    setSharePick((p) => ({ ...p, [doc.id]: e.target.value }))
                                                }
                                            >
                                                <option value="">Share with…</option>
                                                {allUsers.map((u) => (
                                                    <option key={u.id} value={u.id}>{u.username}</option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                className="share-btn"
                                                disabled={!sharePick[doc.id]}
                                                onClick={() => handleShare(doc.id)}
                                            >
                                                Share
                                            </button>
                                        </div>
                                        <button type="button" onClick={() => handleDelete(doc.id)} className="delete-btn">
                                            Delete
                                        </button>
                                    </>
                                )}
                                {doc.access === 'shared' && doc.shareId && (
                                    <button
                                        type="button"
                                        className="revoke-share-btn"
                                        onClick={() => handleRevokeShare(doc.shareId)}
                                    >
                                        Remove from my list
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="security-info">
                <h4>How sharing works</h4>
                <ul>
                    <li>Your uploads are encrypted for your RSA public key (hybrid envelope).</li>
                    <li>Sharing re-encrypts a copy for the recipient’s public key on the server (owner session required).</li>
                    <li>HMAC is verified before creating a shared copy.</li>
                </ul>
            </div>

            {preview && (
                <div
                    className="doc-preview-backdrop"
                    role="presentation"
                    onClick={closePreview}
                >
                    <div
                        className="doc-preview-modal card-surface"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Document preview"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="doc-preview-head">
                            <h4>{preview.title}</h4>
                            <button type="button" className="doc-preview-close" onClick={closePreview}>
                                ✕
                            </button>
                        </div>
                        <div className="doc-preview-body">
                            {preview.kind === 'pdf' ? (
                                <iframe title={preview.title} src={preview.url} className="doc-preview-frame" />
                            ) : (
                                <img src={preview.url} alt="" className="doc-preview-img" />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Documents;
