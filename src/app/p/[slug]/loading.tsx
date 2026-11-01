export default function ClientLoading() {
  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-6 text-slate-400">
      <div className="size-10 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin mb-4" />
      <span className="font-mono text-xs text-indigo-300">Conectando con la sala...</span>
    </div>
  );
}
