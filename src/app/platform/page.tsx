"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/fetchJson";

type OrgRow = {
  id: string;
  name: string;
  createdAt: string;
  userCount: number;
  storageUsedMB: number;
  plan: { name: string; maxUsers: number; maxStorageMB: number };
};

export default function PlatformPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson<{ items: OrgRow[] }>("/api/platform/orgs")
      .then((result) => setOrgs(result.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load organizations"))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await fetchJson("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <button onClick={handleLogout} className="text-sm underline">
          Log out
        </button>
      </div>
      <p className="text-sm text-gray-500">
        Plan and usage metadata only — platform admins never see organization content.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Organization</th>
            <th className="py-2">Plan</th>
            <th className="py-2">Users</th>
            <th className="py-2">Storage</th>
            <th className="py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => (
            <tr key={org.id} className="border-b">
              <td className="py-2">{org.name}</td>
              <td className="py-2">{org.plan.name}</td>
              <td className="py-2">
                {org.userCount} / {org.plan.maxUsers}
              </td>
              <td className="py-2">
                {org.storageUsedMB} / {org.plan.maxStorageMB} MB
              </td>
              <td className="py-2">{new Date(org.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
