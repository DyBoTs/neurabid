import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/Landing';
import { LoginPage } from './pages/Login';
import { MarketplacePage } from './pages/Marketplace';
import { LiveAuctionPage } from './pages/LiveAuction';
import { CreateAuctionPage } from './pages/CreateAuction';
import { BidHistoryPage } from './pages/BidHistory';
import { AdminPage } from './pages/Admin';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin/login" element={<LoginPage variant="admin" />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/auctions/:id" element={<LiveAuctionPage />} />
            <Route path="/create" element={<CreateAuctionPage />} />
            <Route path="/my-bids" element={<BidHistoryPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
