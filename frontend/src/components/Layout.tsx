import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const Layout: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-gray-800 dark:to-gray-900 text-gray-900 dark:text-gray-100">
    <nav className="bg-white dark:bg-gray-800 shadow-md">
      <ul className="flex space-x-4 p-4 max-w-5xl mx-auto">
        <li>
          <NavLink to="/" className={({ isActive }) => isActive ? 'font-bold text-indigo-600' : 'text-gray-600'} end>
            Home
          </NavLink>
        </li>
        <li>
          <NavLink to="/upload" className={({ isActive }) => isActive ? 'font-bold text-indigo-600' : 'text-gray-600'}>
            Upload
          </NavLink>
        </li>
        <li>
          <NavLink to="/bookmarks" className={({ isActive }) => isActive ? 'font-bold text-indigo-600' : 'text-gray-600'}>
            Bookmarks
          </NavLink>
        </li>
        <li>
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'font-bold text-indigo-600' : 'text-gray-600'}>
            Dashboard
          </NavLink>
        </li>
        <li>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'font-bold text-indigo-600' : 'text-gray-600'}>
            Settings
          </NavLink>
        </li>
      </ul>
    </nav>
    <main className="p-6 max-w-5xl mx-auto">
      <Outlet />
    </main>
  </div>
);

export default Layout;
