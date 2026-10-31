export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#041611] px-4">
      <form className="bg-[#07211b] border border-amber/20 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <h1 className="text-3xl font-display text-cream mb-6">Crear cuenta</h1>
        <label htmlFor="email" className="block text-cream/80 mb-2">Email</label>
        <input id="email" type="email" className="w-full rounded-lg bg-[#041611] border border-amber/20 px-4 py-3 text-cream mb-4 focus:outline-none focus:border-amber" placeholder="tu@email.com" />
        <label htmlFor="venue" className="block text-cream/80 mb-2">Nombre del local</label>
        <input id="venue" type="text" className="w-full rounded-lg bg-[#041611] border border-amber/20 px-4 py-3 text-cream mb-4 focus:outline-none focus:border-amber" placeholder="Billar Aurora" />
        <label htmlFor="password" className="block text-cream/80 mb-2">Contraseña</label>
        <input id="password" type="password" className="w-full rounded-lg bg-[#041611] border border-amber/20 px-4 py-3 text-cream mb-6 focus:outline-none focus:border-amber" placeholder="Contraseña" />
        <button type="submit" className="w-full bg-amber text-[#041611] font-semibold rounded-lg py-3 hover:bg-amber/90 transition-colors">Crear cuenta</button>
      </form>
    </main>
  );
}
