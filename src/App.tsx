import { Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import Topbar from "@/components/Topbar";
import Chronicle from "@/routes/Chronicle";
import StoryPage from "@/routes/StoryPage";
import PersonPage from "@/routes/PersonPage";
import TreePage from "@/routes/TreePage";
import LinesPage from "@/routes/LinesPage";
import FilmPage from "@/routes/FilmPage";
import JourneysPage from "@/routes/JourneysPage";
import AtlasPage from "@/routes/AtlasPage";
import GalleryPage from "@/routes/GalleryPage";
import PlacePage from "@/routes/PlacePage";
import NotFound from "@/routes/NotFound";

/** The migration tab holds both moving pictures: the scripted film and
 *  the sequence that flies every recorded journey. ?person= is the film's
 *  own third mode and stays with it. */
function MapSurface() {
  const [params] = useSearchParams();
  return params.get("mode") === "journeys" && !params.get("person") ? (
    <JourneysPage />
  ) : (
    <FilmPage />
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <div className="app">
      <Topbar />
      <ScrollToTop />
      <main className="main">
        <Routes>
          <Route path="/" element={<Chronicle />} />
          <Route path="/story/:id" element={<StoryPage />} />
          <Route path="/person/:id" element={<PersonPage />} />
          <Route path="/tree" element={<TreePage />} />
          <Route path="/lines" element={<LinesPage />} />
          <Route path="/map" element={<MapSurface />} />
          <Route path="/atlas" element={<AtlasPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/place/:id" element={<PlacePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
