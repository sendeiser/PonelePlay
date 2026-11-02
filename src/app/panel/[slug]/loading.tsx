export default function PanelLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-slate-400">
      <div className="size-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
      <span className="font-mono text-xs text-indigo-300">Cargando sección...</span>
    </div>
  );
}

