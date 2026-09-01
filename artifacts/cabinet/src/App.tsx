import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import BootstrapPage from '@/pages/bootstrap';
import LoginPage from '@/pages/login';
import InvitePage from '@/pages/invite';
import DashboardPage from '@/pages/dashboard';
import DiagnosticNewPage from '@/pages/diagnostic-new';
import DiagnosticViewPage from '@/pages/diagnostic-view';
import DiagnosticResultPage from '@/pages/diagnostic-result';
import DiagnosticPlanPage from '@/pages/diagnostic-plan';
import DiagnosticGiftPage from '@/pages/diagnostic-gift';
import TeamPage from '@/pages/team';
import { AuthProvider } from '@/components/auth-provider';
import { Layout } from '@/components/layout';

import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <AuthProvider>
        <Layout>
          <Switch>
            <Route path="/bootstrap" component={BootstrapPage} />
            <Route path="/login" component={LoginPage} />
            <Route path="/invite/:token" component={InvitePage} />
            
            <Route path="/" component={DiagnosticNewPage} />
            <Route path="/analysis/:diagnosticId" component={DiagnosticNewPage} />
            <Route path="/diagnostics" component={DashboardPage} />
            <Route path="/diagnostics/:id" component={DiagnosticViewPage} />
            <Route path="/diagnostics/:id/result" component={DiagnosticResultPage} />
            <Route path="/diagnostics/:id/plan" component={DiagnosticPlanPage} />
            <Route path="/diagnostics/:id/gift" component={DiagnosticGiftPage} />
            <Route path="/team" component={TeamPage} />
            
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </AuthProvider>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
