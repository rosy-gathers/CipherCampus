import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { messageAPI } from '../services/api';
import { sameUserId } from '../utils/user';
import { getApiErrorMessage } from '../utils/apiError';

const POLL_MS = 2200;
const CONV_POLL_MS = 4000;
const MAX_PICKER_RESULTS = 40;

const Messages = () => {
    const [conversations, setConversations] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [peopleQuery, setPeopleQuery] = useState('');
    const [listError, setListError] = useState('');
    const [threadError, setThreadError] = useState('');
    const messagesEndRef = useRef(null);
    const skipScrollRef = useRef(false);
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadConversations = useCallback(async () => {
        try {
            const response = await messageAPI.getConversations();
            setConversations(response.data);
            setListError('');
        } catch (err) {
            setListError(getApiErrorMessage(err, 'Failed to load conversations.'));
            console.error('Failed to load conversations', err);
        }
    }, []);

    const loadAllUsers = useCallback(async () => {
        try {
            const response = await messageAPI.getAllUsers();
            setAllUsers(response.data);
            setListError('');
        } catch (err) {
            setListError(getApiErrorMessage(err, 'Failed to load directory.'));
            console.error('Failed to load all users', err);
        }
    }, []);

    const filteredUsers = useMemo(() => {
        const q = peopleQuery.trim().toLowerCase();
        let list = allUsers;
        if (q) {
            list = list.filter((u) => u.username.toLowerCase().includes(q));
        }
        return list.slice(0, MAX_PICKER_RESULTS);
    }, [allUsers, peopleQuery]);

    const filteredConversations = useMemo(() => {
        const q = peopleQuery.trim().toLowerCase();
        if (!q) return conversations;
        return conversations.filter((c) => c.other_username.toLowerCase().includes(q));
    }, [conversations, peopleQuery]);

    const loadMessages = useCallback(async (userId, opts = {}) => {
        const silent = opts.silent === true;
        const scrollToEnd =
            opts.scrollToEnd !== undefined ? opts.scrollToEnd : !silent;

        try {
            if (!silent) setLoading(true);
            const response = await messageAPI.getMessages(userId);
            if (!scrollToEnd) skipScrollRef.current = true;
            setMessages(response.data);
            setThreadError('');
        } catch (err) {
            setThreadError(getApiErrorMessage(err, 'Failed to load messages.'));
            console.error('Failed to load messages', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadConversations();
        loadAllUsers();
    }, [loadConversations, loadAllUsers]);

    useEffect(() => {
        if (selectedUser) {
            loadMessages(selectedUser.id, { silent: false, scrollToEnd: true });
        }
    }, [selectedUser, loadMessages]);

    useEffect(() => {
        if (!selectedUser) return undefined;

        const uid = selectedUser.id;
        const id = setInterval(() => {
            if (document.hidden) return;
            loadMessages(uid, { silent: true, scrollToEnd: false });
        }, POLL_MS);

        return () => clearInterval(id);
    }, [selectedUser, loadMessages]);

    useEffect(() => {
        const id = setInterval(() => {
            if (document.hidden) return;
            loadConversations();
        }, CONV_POLL_MS);
        return () => clearInterval(id);
    }, [loadConversations]);

    useEffect(() => {
        if (skipScrollRef.current) {
            skipScrollRef.current = false;
            return;
        }
        scrollToBottom();
    }, [messages]);

    const sendCurrentMessage = async () => {
        if (!newMessage.trim() || !selectedUser || sending) return;

        const text = newMessage.trim();
        const receiverId = selectedUser.id;

        setSending(true);
        setThreadError('');
        try {
            await messageAPI.send({
                receiverId,
                message: text,
            });
            setNewMessage('');
            await loadMessages(receiverId, { silent: true, scrollToEnd: true });
            await loadConversations();
        } catch (err) {
            setThreadError(getApiErrorMessage(err, 'Failed to send message.'));
            console.error('Failed to send message', err);
        } finally {
            setSending(false);
        }
    };

    const handleSendMessage = (e) => {
        e.preventDefault();
        sendCurrentMessage();
    };

    const handleComposerKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCurrentMessage();
        }
    };

    const selectConversation = (u) => {
        setSelectedUser(u);
    };

    return (
        <div className="messages-container">
            <header className="messages-header messages-header-row">
                <div className="messages-header-main">
                    <h1>Secure messaging</h1>
                    <p>
                        Messages are encrypted with ECC; HMAC checks detect tampering. Emoji and Unicode are supported
                        when the database uses utf8mb4.
                        <span className="poll-hint"> Updates automatically every few seconds.</span>
                    </p>
                </div>
            </header>

            <div className="messages-layout">
                <div className="conversations-list">
                    <div className="new-chat-section">
                        <h4>Find people</h4>
                        <label htmlFor="people-search" className="sr-only">
                            Search people by name
                        </label>
                        <input
                            id="people-search"
                            type="search"
                            className="people-search-input"
                            placeholder="Search name…"
                            value={peopleQuery}
                            onChange={(e) => setPeopleQuery(e.target.value)}
                            autoComplete="off"
                        />
                        <p className="people-picker-hint">Start a new chat</p>
                        <ul className="people-picker-list" aria-label="Matching users">
                            {filteredUsers.length === 0 && (
                                <li className="people-picker-empty">No matching users</li>
                            )}
                            {filteredUsers.map((u) => (
                                <li key={u.id}>
                                    <button
                                        type="button"
                                        className="people-picker-item"
                                        onClick={() => selectConversation(u)}
                                    >
                                        {u.username}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <h3>Conversations</h3>
                    {listError && (
                        <div className="error" role="alert">
                            {listError}
                        </div>
                    )}
                    {filteredConversations.length === 0 && !listError && (
                        <div className="no-conversations">
                            {peopleQuery.trim() ? 'No conversations match your search.' : 'No past conversations'}
                        </div>
                    )}
                    {filteredConversations.map((conv) => (
                        <div
                            key={conv.other_user_id}
                            className={`conversation-item ${selectedUser && sameUserId(selectedUser.id, conv.other_user_id) ? 'active' : ''}`}
                            onClick={() =>
                                selectConversation({
                                    id: conv.other_user_id,
                                    username: conv.other_username,
                                })
                            }
                        >
                            <div className="conversation-avatar">👤</div>
                            <div className="conversation-info">
                                <strong>{conv.other_username}</strong>
                                <small>{conv.last_message}</small>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="chat-area">
                    {selectedUser ? (
                        <>
                            <div className="chat-header">
                                <h3>Chat with {selectedUser.username}</h3>
                                <span className="encryption-badge" title="Payload encrypted with the other party’s ECC public key">🔒 ECC</span>
                            </div>

                            <div className="messages-list">
                                {threadError && (
                                    <div className="error" role="alert">
                                        {threadError}
                                    </div>
                                )}
                                {loading && <div className="loading">Loading messages…</div>}
                                {!loading &&
                                    messages.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className={`message ${sameUserId(msg.sender_id, user.id) ? 'sent' : 'received'}`}
                                        >
                                            <div className="message-content">
                                                <p style={{ whiteSpace: 'pre-wrap' }}>{msg.message}</p>
                                            </div>
                                            <div className="message-time">
                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                            </div>
                                            {!msg.message.startsWith('[') ? (
                                                msg.validIntegrity ? (
                                                    <div className="message-integrity message-integrity--ok" role="status">
                                                        ✓ Decrypted — HMAC verified
                                                    </div>
                                                ) : (
                                                    <div className="message-integrity message-integrity--bad" role="alert">
                                                        ⚠ HMAC mismatch (decrypt or data issue)
                                                    </div>
                                                )
                                            ) : (
                                                <div className="message-integrity message-integrity--legacy">
                                                    Legacy row — re-send to get full integrity check
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                <div className="messages-end-anchor" ref={messagesEndRef} />
                            </div>

                            <form onSubmit={handleSendMessage} className="message-composer" autoComplete="off">
                                <label className="sr-only" htmlFor="msg-input">Message</label>
                                <textarea
                                    id="msg-input"
                                    className="message-composer-textarea"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={handleComposerKeyDown}
                                    placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                                    disabled={sending}
                                    rows={2}
                                    autoComplete="off"
                                />
                                <button type="submit" className="send-btn" disabled={sending || !newMessage.trim()}>
                                    {sending ? 'Sending…' : 'Send'}
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="no-chat-selected">
                            <p>Select a conversation or search for someone to start messaging</p>
                            <p className="security-note">All messages are encrypted with ECC (Elliptic Curve Cryptography)</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Messages;
