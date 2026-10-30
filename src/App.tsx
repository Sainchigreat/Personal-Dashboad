import { AppProvider, useApp } from "./lib/store";
import Shell from "./components/Shell";
import Forms from "./components/Forms";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import MyDay from "./pages/MyDay";
import Course from "./pages/Course";
import Studio from "./pages/Studio";
import Chapter from "./pages/Chapter";
import Brand from "./pages/Brand";
import Pipeline from "./pages/Pipeline";
import Review from "./pages/Review";
import Settings from "./pages/Settings";
import TeamWorkspace from "./pages/TeamWorkspace";

function Workspace() {
  const { page } = useApp();
  const views = {
    command: <Dashboard />,
    day: <MyDay />,
    course: <Course />,
    studio: <Studio />,
    chapter: <Chapter />,
    brand: <Brand />,
    pipeline: <Pipeline />,
    review: <Review />,
    settings: <Settings />,
    team: <TeamWorkspace />,
  };
  return (
    <>
      <Shell>{views[page]}</Shell>
      <Forms />
    </>
  );
}
export default function App() {
  return (
    <AppProvider authView={(props) => <Auth {...props} />}>
      <Workspace />
    </AppProvider>
  );
}
