import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#041611] text-cream font-sans">
      <section className="flex flex-col items-center justify-center text-center px-6 py-24">
        <h1 className="font-display text-6xl md:text-8xl text-cream mb-4 tracking-tight">PonelePlay</h1>
        <p className="text-xl md:text-2xl text-amber mb-2">Fieltro y Neón</p>
        <p className="text-lg text-cream/70 max-w-xl mb-12">Votación colaborativa para bares. Escaneá, votá, proponé.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
          <Link href="/p/billar-aurora" className="group block bg-[#07211b] border border-amber/20 rounded-3xl p-8 hover:border-amber/60 transition-colors shadow-xl">
            <h2 className="font-display text-2xl mb-3">Cliente</h2>
            <p className="text-cream/70">Ver la cola, votar y proponer temas.</p>
          </Link>
          <Link href="/panel/billar-aurora" className="group block bg-[#07211b] border border-amber/20 rounded-3xl p-8 hover:border-amber/60 transition-colors shadow-xl">
            <h2 className="font-display text-2xl mb-3">Panel del bar</h2>
            <p className="text-cream/70">Operar la noche, códigos y moderación.</p>
          </Link>
          <Link href="/player/billar-aurora" className="group block bg-[#07211b] border border-amber/20 rounded-3xl p-8 hover:border-amber/60 transition-colors shadow-xl">
            <h2 className="font-display text-2xl mb-3">Reproductor</h2>
            <p className="text-cream/70">Pantalla completa para el salón.</p>
          </Link>
        </div>
      </section>
      <footer className="text-center text-cream/40 text-sm py-6">PonelePlay v1 — 31/10/2026</footer>
    </main>
  );
}
