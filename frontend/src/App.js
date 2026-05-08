import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import AppLayout from './components/AppLayout';
import Dashboard from './components/Dashboard';
import Feed from './components/Feed';
import Messages from './components/Messages';
import Documents from './components/Documents';
import Reports from './components/Reports';
import AdminPanel from './components/AdminPanel';
import Profile from './components/Profile';

const PrivateRoute = ({ children }) => {
    const isAuth = !!localStorage.getItem('token');
    return isAuth ? children : <Navigate to="/login" />;
};

const App = () => {
    return (
        <Router>
            <div className="app">
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/dashboard" element={
                        <PrivateRoute><AppLayout><Dashboard /></AppLayout></PrivateRoute>
                    } />
                    <Route path="/feed" element={
                        <PrivateRoute><AppLayout><Feed /></AppLayout></PrivateRoute>
                    } />
                    <Route path="/messages" element={
                        <PrivateRoute><AppLayout><Messages /></AppLayout></PrivateRoute>
                    } />
                    <Route path="/documents" element={
                        <PrivateRoute><AppLayout><Documents /></AppLayout></PrivateRoute>
                    } />
                    <Route path="/reports" element={
                        <PrivateRoute><AppLayout><Reports /></AppLayout></PrivateRoute>
                    } />
                    <Route path="/admin" element={
                        <PrivateRoute><AppLayout><AdminPanel /></AppLayout></PrivateRoute>
                    } />
                    <Route path="/profile" element={
                        <PrivateRoute><AppLayout><Profile /></AppLayout></PrivateRoute>
                    } />
                    <Route path="/" element={<Navigate to="/login" />} />
                </Routes>
            </div>
        </Router>
    );
};

export default App;