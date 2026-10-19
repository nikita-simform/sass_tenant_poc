"use client";

import { fetchJson } from "@/lib/api/fetchJson";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type Resource = {
  id: string;
  name: string;
  content: string | null;
  sizeBytes: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export default function ResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [resource, setResource] = useState<Resource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadResource() {
      setLoading(true);
      setError(null);
      setResource(null);
      try {
        const data = await fetchJson<Resource>(`/api/resources/${id}`);
        if (!cancelled) setResource(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load resource");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadResource();

    return () => {
      cancelled = true;
    };
  }, [id]);

  function startEditing() {
    if (!resource) return;
    setEditName(resource.name);
    setEditContent(resource.content ?? "");
    setSaveError(null);
    setIsEditing(true);
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await fetchJson<Resource>(`/api/resources/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName, content: editContent }),
      });
      setResource(updated);
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link href="/dashboard" className="text-sm underline">
        &larr; Back to dashboard
      </Link>

      <h1 className="text-2xl font-semibold">Resource details</h1>

      <p className="rounded bg-gray-50 p-2 font-mono text-xs text-gray-500">
        Requested ID: {id}
      </p>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      {!loading && error && (
        <div className="rounded border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <p className="mt-1 text-xs text-red-600">
            Either this resource doesn&apos;t exist, or it belongs to a
            different organization than the one you&apos;re currently signed
            into — tenant isolation means it was never visible to this
            request in the first place.
          </p>
        </div>
      )}

      {!loading && !error && resource && !isEditing && (
        <section className="space-y-3 rounded border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase text-gray-500">ID</span>
            <button onClick={startEditing} className="text-sm underline">
              Edit
            </button>
          </div>
          <p className="break-all font-mono text-sm">{resource.id}</p>
          <div>
            <span className="text-xs uppercase text-gray-500">Name</span>
            <p className="text-sm">{resource.name}</p>
          </div>
          <div>
            <span className="text-xs uppercase text-gray-500">Size</span>
            <p className="text-sm">{resource.sizeBytes} bytes</p>
          </div>
          <div>
            <span className="text-xs uppercase text-gray-500">Created</span>
            <p className="text-sm">
              {new Date(resource.createdAt).toLocaleString()}
            </p>
          </div>
          {resource.content && (
            <div>
              <span className="text-xs uppercase text-gray-500">Content</span>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2 text-sm">
                {resource.content}
              </pre>
            </div>
          )}
        </section>
      )}

      {!loading && !error && resource && isEditing && (
        <form onSubmit={handleSaveEdit} className="space-y-3 rounded border p-4">
          <div>
            <span className="text-xs uppercase text-gray-500">Name</span>
            <input
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <span className="text-xs uppercase text-gray-500">Content</span>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded border px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
