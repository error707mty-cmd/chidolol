import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import PliegosList from "@/pages/PliegosList";
import Export from "@/pages/Export";
import Login from "@/pages/Login";
import AdminPanel from "@/pages/AdminPanel";
import AdminUsers from "@/pages/AdminUsers";
import AdminMemberships from "@/pages/AdminMemberships";
import AdminAI from "@/pages/AdminAI";
import AdminAsistente from "@/pages/AdminAsistente";
import Profile from "@/pages/Profile";
import Billing from "@/pages/Billing";
import ChatAI from "@/pages/ChatAI";
import Yuki from "@/pages/Yuki";
import { AuthProvider, useAuth } from "@/context/AuthContext";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        gcTime: 5 * 60 * 1000,
      },
    },
  });
}

// Each user session gets its own isolated QueryClient so cached data from
// user A is never visible to user B.
function SessionQueryClientProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const sessionKeyRef = useRef<number | undefined>(undefined);
  const qcRef = useRef<QueryClient>(makeQueryClient());

  if (sessionKeyRef.current !== user?.userId) {
    if (sessionKeyRef.current !== undefined) {
      // User changed — create a fresh client to discard all cached queries
      qcRef.current.clear();
      qcRef.current = makeQueryClient();
    }
    sessionKeyRef.current = user?.userId;
  }

  return (
    <QueryClientProvider client={qcRef.current}>
      {children}
    </QueryClientProvider>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  // Public routes — accessible without authentication
  return (
    <Switch>
      <Route path="/chat-ia" component={ChatAI} />
      <Route path="/yuki" component={Yuki} />

      {/* Auth-required routes */}
      <Route>
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", background: "#04020C" }}>
            <span className="login-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>
        ) : !user ? (
          <Login />
        ) : (
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/pliegos" component={PliegosList} />
            <Route path="/export/:id" component={Export} />
            <Route path="/perfil" component={Profile} />
            <Route path="/pro" component={Billing} />
            {user.isAdmin && <Route path="/admin" component={AdminPanel} />}
            {user.isAdmin && <Route path="/admin/usuarios" component={AdminUsers} />}
            {user.isAdmin && <Route path="/admin/membresias" component={AdminMemberships} />}
            {user.isAdmin && <Route path="/admin/ia" component={AdminAI} />}
            {user.isAdmin && <Route path="/admin/asistente" component={AdminAsistente} />}
            <Route component={NotFound} />
          </Switch>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <TooltipProvider>
      <AuthProvider>
        <SessionQueryClientProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </SessionQueryClientProvider>
      </AuthProvider>
    </TooltipProvider>
  );
}

export default App;
