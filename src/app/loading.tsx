export default function GlobalLoading() {
  return (
    <div className="fixed inset-0 bg-th-canvas flex flex-col items-center justify-center z-50">
      <div className="size-8 rounded-full border-2 border-th-accent/30 border-t-th-accent animate-spin mb-3" />
      <span className="font-mono text-xs font-semibold text-th-accent">PonelePlay</span>
    </div>
  );
}

