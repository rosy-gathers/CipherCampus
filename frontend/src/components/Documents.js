import React, { useState, useEffect } from 'react';
import { documentAPI } from '../services/api';

const Documents = () => {
    const [documents, setDocuments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);

    useEffect(() => {
        loadDocuments();
    }, []);

    const loadDocuments = async () => {
        try {
            setLoading(true);
            const response = await documentAPI.getAll();
            setDocuments(response.data);
            setError('');
        } catch (err) {
            setError('Failed to load documents');
        } finally {
            setLoading(false);
        }
    };

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

        try {
            setUploading(true);
            await documentAPI.upload(formData);
            setSelectedFile(null);
            document.getElementById('fileInput').value = '';
            await loadDocuments();
            setError('');
        } catch (err) {
            setError('Failed to upload document');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this document?')) {
            try {
                await documentAPI.delete(id);
                await loadDocuments();
            } catch (err) {
                setError('Failed to delete document');
            }
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
        } catch (err) {
            setError('Failed to download document');
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="documents-container">
            <div className="documents-header">
                <h1>Secure Document Vault</h1>
                <p>Upload and store academic documents with RSA encryption</p>
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
                    <button type="submit" disabled={uploading}>
                        {uploading ? 'Encrypting & Uploading...' : '📤 Upload (RSA Encrypted)'}
                    </button>
                </form>
                {error && <div className="error">{error}</div>}
            </div>

            <div className="documents-list">
                <h3>Your Documents</h3>
                {loading && <div className="loading">Loading documents...</div>}
                
                {documents.length === 0 && !loading && (
                    <div className="no-documents">
                        <p>No documents uploaded yet.</p>
                        <p>Upload academic files - they will be encrypted with RSA before storage.</p>
                    </div>
                )}

                <div className="documents-grid">
                    {documents.map((doc) => (
                        <div key={doc.id} className="document-card">
                            <div className="document-icon">
                                {doc.file_name.endsWith('.pdf') ? '📄' :
                                 doc.file_name.endsWith('.doc') || doc.file_name.endsWith('.docx') ? '📝' :
                                 doc.file_name.endsWith('.txt') ? '📃' :
                                 doc.file_name.endsWith('.jpg') || doc.file_name.endsWith('.png') ? '🖼️' : '📎'}
                            </div>
                            <div className="document-info">
                                <h4>{doc.file_name}</h4>
                                <small>Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}</small>
                                <div className="security-badge">🔒 Encrypted with RSA + HMAC</div>
                            </div>
                            <div className="document-actions">
                                <button onClick={() => handleDownload(doc.id, doc.file_name)} className="download-btn">
                                    ⬇️ Download
                                </button>
                                <button onClick={() => handleDelete(doc.id)} className="delete-btn">
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="security-info">
                <h4>Security Features</h4>
                <ul>
                    <li>✅ Files encrypted with RSA before storage</li>
                    <li>✅ HMAC integrity verification</li>
                    <li>✅ Even database admin cannot read your files</li>
                    <li>✅ Asymmetric encryption only (no symmetric)</li>
                </ul>
            </div>
        </div>
    );
};

export default Documents;