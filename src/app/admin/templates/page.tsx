"use client";
import React, { useEffect, useState } from 'react';

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/templates');
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch (e) {
      console.error(e);
      setMessage('Failed to load templates (are you an admin?)');
    } finally {
      setLoading(false);
    }
  }

  async function seedTemplates() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seed' }) });
      const data = await res.json();
      setMessage(data.message || data.error || 'Seed completed');
      await fetchTemplates();
    } catch (e) {
      console.error(e);
      setMessage('Seed failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTemplates(); }, []);

  async function deleteTemplate(id: string) {
    if (!confirm('Delete template?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/templates`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const data = await res.json();
      setMessage(data.message || data.error || 'Deleted');
      await fetchTemplates();
    } catch (e) {
      console.error(e);
      setMessage('Delete failed');
    } finally { setLoading(false); }
  }

  async function updateTemplate(id: string, name: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/templates`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: id, updates: { name } }) });
      const data = await res.json();
      setMessage(data.message || data.error || 'Updated');
      await fetchTemplates();
    } catch (e) {
      console.error(e);
      setMessage('Update failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin — Templates</h1>
      <div className="mb-4">
        <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={seedTemplates} disabled={loading}>Seed System Templates</button>
      </div>
      {message && <div className="mb-4 text-sm text-gray-700">{message}</div>}
      <div>
        {loading && <div>Loading…</div>}
        {!loading && (
          <table className="w-full text-sm border">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 text-left">Name</th>
                <th className="p-2">Category</th>
                <th className="p-2">Public</th>
                <th className="p-2">Scheduled</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} className="border-t">
                  <td className="p-2">{t.name}</td>
                  <td className="p-2">{t.category}</td>
                  <td className="p-2">{String(t.isPublic)}</td>
                  <td className="p-2">{t.scheduledCount || 0}</td>
                  <td className="p-2">
                    <button className="mr-2 px-2 py-1 bg-yellow-400" onClick={() => { const newName = prompt('New name', t.name); if (newName) updateTemplate(t.id, newName); }}>Edit</button>
                    <button className="px-2 py-1 bg-red-500 text-white" onClick={() => deleteTemplate(t.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
