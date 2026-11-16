import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShellHeader } from './components/AppShellHeader';
import { AccountLinkModal } from './components/Modals';
import { PartyPreviewProvider } from './context/PartyPreviewContext';
import { JoinRoomPage } from './pages/JoinRoomPage';
import { LandingPage } from './pages/LandingPage';
import { LiveRoomPage } from './pages/LiveRoomPage';
import { PartySummaryPage } from './pages/PartySummaryPage';
import { TvModePage } from './pages/TvModePage';

export function App() {
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <PartyPreviewProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-canvas text-ink">
          <AppShellHeader onOpenAccountModal={() => setAccountOpen(true)} />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/join/:code" element={<JoinRoomPage />} />
            <Route path="/room/:code" element={<LiveRoomPage />} />
            <Route path="/room/:code/tv" element={<TvModePage />} />
            <Route path="/room/:code/summary" element={<PartySummaryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <AccountLinkModal open={accountOpen} onClose={() => setAccountOpen(false)} />
          <Toaster richColors position="bottom-right" />
        </div>
      </BrowserRouter>
    </PartyPreviewProvider>
  );
}

export default App;
