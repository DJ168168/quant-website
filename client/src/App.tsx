import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CyberLayout from "./components/CyberLayout";

// Pages
import Dashboard from "./pages/Dashboard";
import Signals from "./pages/Signals";
import Resonance from "./pages/Resonance";
import Strategies from "./pages/Strategies";
import PaperTrading from "./pages/PaperTrading";
import LiveTrading from "./pages/LiveTrading";
import TradeHistory from "./pages/TradeHistory";
import ValueScan from "./pages/ValueScan";
import CoinGlassPage from "./pages/CoinGlass";
import Market from "./pages/Market";
import Sentiment from "./pages/Sentiment";
import TelegramConfig from "./pages/TelegramConfig";
import SystemSettings from "./pages/SystemSettings";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <CyberLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/signals" component={Signals} />
        <Route path="/resonance" component={Resonance} />
        <Route path="/strategies" component={Strategies} />
        <Route path="/paper" component={PaperTrading} />
        <Route path="/live" component={LiveTrading} />
        <Route path="/trades" component={TradeHistory} />
        <Route path="/valuescan" component={ValueScan} />
        <Route path="/coinglass" component={CoinGlassPage} />
        <Route path="/market" component={Market} />
        <Route path="/sentiment" component={Sentiment} />
        <Route path="/telegram" component={TelegramConfig} />
        <Route path="/settings" component={SystemSettings} />
        <Route component={NotFound} />
      </Switch>
    </CyberLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
