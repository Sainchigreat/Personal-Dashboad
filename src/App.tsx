import { AppProvider, useApp } from "./lib/store";
import Shell from "./components/Shell";
import Forms from "./components/Forms";
import Onboarding from "./components/Onboarding";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import MyDay from "./pages/MyDay";
import Course from "./pages/Course";
import Studio from "./pages/Studio";
import Chapter from "./pages/Chapter";
import Brand from "./pages/Brand";
import Pipeline from "./pages/Pipeline";
import Review from "./pages/Review";
import Goals from "./pages/Goals";
import Speakers from "./pages/Speakers";
import Settings from "./pages/Settings";
import TeamWorkspace from "./pages/TeamWorkspace";
import TeamPortal from "./pages/TeamPortal";
import Cloud from "./pages/Cloud";
import { TeamProvider } from "./lib/team";

function Workspace() {
  const { page, auth } = useApp();
  const views = {
    command: <Dashboard />,
    day: <MyDay />,
    course: <Course />,
    studio: <Studio />,
    chapter: <Chapter />,
    brand: <Brand />,
    pipeline: <Pipeline />,
    review: <Review />,
    goals: <Goals />,
    speakers: <Speakers />,
    team: <TeamWorkspace auth={auth} />,
    cloud: <Cloud />,
    settings: <Settings />,
  };
  return (
    <>
      <Shell>{views[page]}</Shell>
      <Forms />
      <Onboarding />
    </>
  );
}
export default function App() {
  return (
    <AppProvider
      authView={(props) => <Auth {...props} />}
      teamView={(props) => (
        <TeamProvider>
          <TeamPortal {...props} />
        </TeamProvider>
      )}
    >
      <TeamProvider>
        <Workspace />
      </TeamProvider>
    </AppProvider>
  );
}
