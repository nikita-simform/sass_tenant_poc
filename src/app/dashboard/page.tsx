"use client";

import { fetchJson } from "@/lib/api/fetchJson";
import { PLAN_NAMES } from "@/lib/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type Session = { userId: string; role: string; organizationId: string | null };
type Resource = {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
};
type OrgUser = { id: string; email: string; role: string; createdAt: string };
type OrgSummary = {
  id: string;
  name: string;
  userCount: number;
  storageUsedMB: number;
  plan: { name: string; maxUsers: number; maxStorageMB: number };
};

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [orgSummary, setOrgSummary] = useState<OrgSummary | null>(null);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [resourceTotal, setResourceTotal] = useState(0);
  const [resourcePage, setResourcePage] = useState(1);
  const RESOURCE_PAGE_SIZE = 5;
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "sizeBytes">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [newResourceName, setNewResourceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ORG_ADMIN" | "ORG_MEMBER">(
    "ORG_MEMBER",
  );
  const [lastInvite, setLastInvite] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>(PLAN_NAMES[0]);
  const [changingPlan, setChangingPlan] = useState(false);

  async function loadAll() {
    try {
      const me = await fetchJson<Session>("/api/auth/me");
      setSession(me);

      const query = new URLSearchParams({
        page: String(resourcePage),
        pageSize: String(RESOURCE_PAGE_SIZE),
        sortBy,
        sortDir,
      });
      if (search) query.set("search", search);

      const resourceList = await fetchJson<{ items: Resource[]; total: number }>(
        `/api/resources?${query.toString()}`,
      );
      setResources(resourceList.items);
      setResourceTotal(resourceList.total);

      if (me.role === "ORG_ADMIN" && me.organizationId) {
        const [summary, users] = await Promise.all([
          fetchJson<OrgSummary>(`/api/orgs/${me.organizationId}`),
          fetchJson<{ items: OrgUser[] }>(
            `/api/orgs/${me.organizationId}/users`,
          ),
        ]);
        setOrgSummary(summary);
        setOrgUsers(users.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
    // Re-fetches (session + org info too, not just resources) whenever the
    // resource list's page/sort/search changes — simplest correct option;
    // splitting resource-fetching out from the rest of loadAll would save a
    // couple of redundant calls but isn't worth the extra complexity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourcePage, sortBy, sortDir, search]);

  useEffect(() => {
    if (orgSummary) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPlan(orgSummary.plan.name);
    }
  }, [orgSummary]);

  async function handleCreateResource(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    try {
      await fetchJson("/api/resources", {
        method: "POST",
        body: JSON.stringify({ name: newResourceName }),
      });
      setNewResourceName("");
      await loadAll();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create resource",
      );
    }
  }

  async function handleDeleteResource(id: string) {
    setError(null);
    setSuccessMessage(null);
    try {
      await fetchJson(`/api/resources/${id}`, { method: "DELETE" });
      await loadAll();
      setSuccessMessage("Resource deleted successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete resource",
      );
    }
  }

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLastInvite(null);
    if (!session?.organizationId) return;
    try {
      const result = await fetchJson<{
        email: string;
        temporaryPassword: string;
      }>(`/api/orgs/${session.organizationId}/users`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setLastInvite(result);
      setInviteEmail("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite user");
    }
  }

  async function handleRemoveUser(userId: string) {
    if (!session?.organizationId) return;
    setError(null);
    setSuccessMessage(null);
    try {
      await fetchJson(`/api/orgs/${session.organizationId}/users/${userId}`, {
        method: "DELETE",
      });
      await loadAll();
      setSuccessMessage("Member removed successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove user");
    }
  }

  async function handleChangePlan(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (!session?.organizationId) return;
    setChangingPlan(true);
    try {
      await fetchJson(`/api/orgs/${session.organizationId}/plan`, {
        method: "PATCH",
        body: JSON.stringify({ planName: selectedPlan }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change plan");
    } finally {
      setChangingPlan(false);
    }
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setResourcePage(1);
    setSearch(searchInput.trim());
  }

  function handleSortChange(value: string) {
    const [field, dir] = value.split(":") as [typeof sortBy, typeof sortDir];
    setResourcePage(1);
    setSortBy(field);
    setSortDir(dir);
  }

  const totalPages = Math.max(1, Math.ceil(resourceTotal / RESOURCE_PAGE_SIZE));

  async function handleLogout() {
    await fetchJson("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!session) {
    return (
      <main className="p-8 text-sm text-gray-500">{error ?? "Loading..."}</main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <button onClick={handleLogout} className="text-sm underline">
          Log out
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {successMessage && (
        <p className="text-sm text-green-600">{successMessage}</p>
      )}

      {orgSummary && (
        <section className="rounded border p-4">
          <h2 className="mb-1 font-medium">
            {orgSummary.name} — {orgSummary.plan.name} plan
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            Users: {orgSummary.userCount} / {orgSummary.plan.maxUsers} &middot;
            Storage: {orgSummary.storageUsedMB} / {orgSummary.plan.maxStorageMB}{" "}
            MB
          </p>
          <form onSubmit={handleChangePlan} className="flex items-center gap-2">
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="rounded border px-3 py-2 text-sm"
            >
              {PLAN_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={changingPlan || selectedPlan === orgSummary.plan.name}
              className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {changingPlan ? "Changing..." : "Change plan"}
            </button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">Resources</h2>
        <form onSubmit={handleCreateResource} className="flex gap-2">
          <input
            required
            placeholder="Resource name"
            value={newResourceName}
            onChange={(e) => setNewResourceName(e.target.value)}
            className="flex-1 rounded border px-3 py-2"
          />
          <button
            type="submit"
            className="rounded bg-black px-3 py-2 text-white"
          >
            Create
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              placeholder="Search by name"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="rounded border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded border px-3 py-2 text-sm"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setResourcePage(1);
                }}
                className="text-sm underline"
              >
                Clear
              </button>
            )}
          </form>
          <select
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => handleSortChange(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="name:asc">Name (A-Z)</option>
            <option value="name:desc">Name (Z-A)</option>
            <option value="sizeBytes:desc">Largest first</option>
            <option value="sizeBytes:asc">Smallest first</option>
          </select>
        </div>

        <ul className="divide-y rounded border">
          {resources.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between px-3 py-2"
            >
              <Link
                href={`/dashboard/resources/${r.id}`}
                className="underline"
              >
                {r.name}
              </Link>
              <button
                onClick={() => handleDeleteResource(r.id)}
                className="text-sm text-red-600 underline"
              >
                Delete
              </button>
            </li>
          ))}
          {resources.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">
              {search ? `No resources match "${search}".` : "No resources yet."}
            </li>
          )}
        </ul>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            {resourceTotal} resource{resourceTotal === 1 ? "" : "s"} total &middot; page{" "}
            {resourcePage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={resourcePage <= 1}
              onClick={() => setResourcePage((p) => p - 1)}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={resourcePage >= totalPages}
              onClick={() => setResourcePage((p) => p + 1)}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {session.role === "ORG_ADMIN" && (
        <section className="space-y-3">
          <h2 className="font-medium">Team</h2>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              required
              placeholder="Email to invite"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded border px-3 py-2"
            />
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as "ORG_ADMIN" | "ORG_MEMBER")
              }
              className="rounded border px-3 py-2"
            >
              <option value="ORG_MEMBER">Member</option>
              <option value="ORG_ADMIN">Admin</option>
            </select>
            <button
              type="submit"
              className="rounded bg-black px-3 py-2 text-white"
            >
              Invite
            </button>
          </form>
          {lastInvite && (
            <p className="rounded bg-yellow-50 p-2 text-sm">
              Invited {lastInvite.email}. Temporary password (share out of band
              — POC only, no real email delivery):{" "}
              <code>{lastInvite.temporaryPassword}</code>
            </p>
          )}
          <ul className="divide-y rounded border">
            {orgUsers.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between px-3 py-2"
              >
                <span>
                  {u.email}{" "}
                  <span className="text-xs text-gray-500">({u.role})</span>
                </span>
                {u.id !== session.userId && (
                  <button
                    onClick={() => handleRemoveUser(u.id)}
                    className="text-sm text-red-600 underline"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
