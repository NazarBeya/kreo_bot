import React, { useEffect, useState } from 'react';
import apiClient from '../api';

interface AdminUser {
  id: string;
  telegram_id: number;
  username?: string;
  display_name?: string;
  role: string;
  is_active: boolean;
}

export const AdminUsersPanel: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [telegramId, setTelegramId] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('buyer');

  const loadUsers = async () => {
    const response = await apiClient.get('/api/admin/users');
    setUsers(response.data.data);
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const whitelistUser = async () => {
    if (!telegramId.trim()) return;
    await apiClient.post('/api/admin/users/whitelist', {
      telegram_id: Number(telegramId),
      username: username.trim() || undefined,
      role,
    });
    setTelegramId('');
    setUsername('');
    await loadUsers();
  };

  const updateUser = async (user: AdminUser, patch: Partial<AdminUser>) => {
    await apiClient.put(`/api/admin/users/${user.id}`, patch);
    await loadUsers();
  };

  return (
    <section className="admin-panel">
      <h2>користувачі</h2>
      <div className="admin-inline-form">
        <input placeholder="telegram id" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} />
        <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="buyer">buyer</option>
          <option value="lead">lead</option>
          <option value="admin">admin</option>
          <option value="designer">designer</option>
        </select>
        <button onClick={() => void whitelistUser()}>додати</button>
      </div>
      <div className="buyer-record-list">
        {users.map((user) => (
          <article key={user.id}>
            <div>
              <strong>@{user.username || user.display_name || user.telegram_id}</strong>
              <small>{user.role} · tg:{user.telegram_id}</small>
            </div>
            <select
              value={user.role}
              onChange={(event) => void updateUser(user, { role: event.target.value })}
            >
              <option value="buyer">buyer</option>
              <option value="lead">lead</option>
              <option value="admin">admin</option>
              <option value="designer">designer</option>
            </select>
            <button
              className={user.is_active ? 'active' : ''}
              onClick={() => void updateUser(user, { is_active: !user.is_active })}
            >
              {user.is_active ? 'active' : 'blocked'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
};
