import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Dados from "@/pages/Dados";
import Configuracoes from "@/pages/Configuracoes";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dados" element={<Dados />} />
          <Route path="/config" element={<Configuracoes />} />
        </Route>
      </Routes>
    </Router>
  );
}
