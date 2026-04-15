import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/Dashboard";
import Market from "@/pages/Market";
import PaperTrading from "@/pages/PaperTrading";
import LiveTrading from "@/pages/LiveTrading";
import TelegramConfig from "@/pages/TelegramConfig";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Home() {
  return <Dashboard />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/market" component={Market} />
      <Route path="/paper" component={PaperTrading} />
      <Route path="/live" component={LiveTrading} />
      <Route path="/telegram" component={TelegramConfig} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
