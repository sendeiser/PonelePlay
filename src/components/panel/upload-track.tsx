"use client";

import { useRef, useState } from "react";
import { Music, RefreshCw, Upload } from "lucide-react";
import { uploadMp3Track, type TrackRow } from "@/lib/api/catalog";
import { validateUpload } from "@/lib/domain/upload";

interface UploadTrackProps {
  venueId: string;
  onUploaded: (track: TrackRow) => void;
}

export function UploadTrack({ venueId, onUploaded }: UploadTrackProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isExplicit, setIsExplicit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateUpload({
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (validation === "too_large") {
      setError("El archivo supera el tamaño máximo de 25 MB.");
      setSelectedFile(null);
      return;
    }
    if (validation === "invalid_type") {
      setError("Solo se admiten archivos .mp3.");
      setSelectedFile(null);
      return;
    }

    setError(null);
    setSelectedFile(file);

    // Auto-fill title from filename
    const cleanName = file.name.replace(/\.mp3$/i, "");
    if (!title) {
      setTitle(cleanName);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || !title.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const track = await uploadMp3Track(venueId, selectedFile, {
        title,
        artist,
        isExplicit,
      });
      onUploaded(track);
      setSelectedFile(null);
      setTitle("");
      setArtist("");
      setIsExplicit(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al subir archivo",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleUpload}
      className="rounded-2xl border border-th-border bg-th-recessed/50 p-5 space-y-4"
    >
      <div className="flex items-center gap-2 border-b border-th-border pb-3">
        <Upload className="size-4 text-th-teal" />
        <h3 className="font-mono text-xs font-bold text-th-text uppercase tracking-wider">
          Subir archivo MP3
        </h3>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-mono text-th-danger">
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="mp3-file" className="ui-label">
          Archivo de audio (.mp3, máx 25 MB)
        </label>
        <input
          id="mp3-file"
          ref={fileInputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          onChange={handleFileSelect}
          className="mt-1.5 w-full rounded-xl border border-th-border bg-th-card p-2 text-xs text-th-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-th-teal-soft file:px-3 file:py-1.5 file:font-mono file:text-[11px] file:font-semibold file:text-th-teal hover:file:opacity-90"
          required
        />
      </div>

      {selectedFile ? (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="upload-title" className="ui-label">
                Título
              </label>
              <input
                id="upload-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="ui-input mt-1"
                required
              />
            </div>

            <div>
              <label htmlFor="upload-artist" className="ui-label">
                Artista
              </label>
              <input
                id="upload-artist"
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="ui-input mt-1"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isExplicit}
              onChange={(e) => setIsExplicit(e.target.checked)}
              className="size-4 rounded accent-blue-600 border-th-border bg-th-recessed"
            />
            <span className="text-xs font-mono text-th-secondary">
              Contenido explícito
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-th-teal hover:opacity-90 py-2.5 font-mono text-xs font-bold text-white shadow-sm disabled:opacity-50 transition-opacity"
          >
            {loading ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Music className="size-3.5" />
            )}
            Guardar MP3 en el catálogo
          </button>
        </div>
      ) : null}
    </form>
  );
}

