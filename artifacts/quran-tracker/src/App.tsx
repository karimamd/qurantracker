import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import JuzList from "@/pages/juz-list";
import JuzDetail from "@/pages/juz-detail";
import SurahList from "@/pages/surah-list";
import SurahDetail from "@/pages/surah-detail";
import PageList from "@/pages/page-list";
import Recite from "@/pages/recite";
import HomeworkList from "@/pages/homework-list";
import HomeworkDetail from "@/pages/homework-detail";
import SettingsPage from "@/pages/settings-page";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/juz" component={JuzList} />
        <Route path="/juz/:id" component={JuzDetail} />
        <Route path="/surah" component={SurahList} />
        <Route path="/surah/:id" component={SurahDetail} />
        <Route path="/pages" component={PageList} />
        <Route path="/recite" component={Recite} />
        <Route path="/homework" component={HomeworkList} />
        <Route path="/homework/:id" component={HomeworkDetail} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
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
