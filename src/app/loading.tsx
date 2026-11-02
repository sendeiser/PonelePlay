export default function GlobalLoading() {
  return (
    <div className="fixed inset-0 bg-[#090D16] flex flex-col items-center justify-center z-50">
      <div className="size-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin mb-3" />
      <span className="font-mono text-xs text-indigo-300">PonelePlay</span>
    </div>
  );
}

