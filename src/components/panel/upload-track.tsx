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
      className="rounded-2xl border border-cream/10 bg-white/[0.02] p-5 space-y-4"
    >
      <div className="flex items-center gap-2 border-b border-cream/10 pb-3">
        <Upload className="size-4 text-mint" />
        <h3 className="font-display text-sm font-bold text-cream">
          Subir archivo MP3
        </h3>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-coral">
          {error}
        </p>
      ) : null}

      <div>
        <label
          htmlFor="mp3-file"
          className="block font-mono text-[10px] uppercase tracking-wider text-cream/50"
        >
          Archivo de audio (.mp3, máx 25 MB)
        </label>
        <input
          id="mp3-file"
          ref={fileInputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          onChange={handleFileSelect}
          className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 p-2 text-xs text-cream/80 file:mr-3 file:rounded-lg file:border-0 file:bg-mint/15 file:px-3 file:py-1 file:font-mono file:text-[11px] file:text-mint hover:file:bg-mint/25"
          required
        />
      </div>

      {selectedFile ? (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="upload-title"
                className="block font-mono text-[10px] uppercase tracking-wider text-cream/50"
              >
                Título
              </label>
              <input
                id="upload-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 text-xs text-cream placeholder:text-cream/25 focus:border-mint focus:outline-none"
                required
              />
            </div>

            <div>
              <label
                htmlFor="upload-artist"
                className="block font-mono text-[10px] uppercase tracking-wider text-cream/50"
              >
                Artista
              </label>
              <input
                id="upload-artist"
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="mt-1 w-full rounded-xl border border-cream/15 bg-white/5 px-3 py-2 text-xs text-cream placeholder:text-cream/25 focus:border-mint focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isExplicit}
              onChange={(e) => setIsExplicit(e.target.checked)}
              className="size-4 rounded border-cream/20 bg-white/5 text-mint focus:ring-0"
            />
            <span className="text-xs text-cream/70">
              Contenido explícito
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-mint py-2.5 font-display text-xs font-bold text-[#041611] hover:bg-mint/90 disabled:opacity-50"
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

