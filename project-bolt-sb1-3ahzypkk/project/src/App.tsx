import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import Layout from './components/Layout';
import UploadReconcile from './components/UploadReconcile';
import Visualize from './components/Visualize';
import ZenChat from './components/ZenChat';

function App() {
  return (
    <SessionProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<UploadReconcile />} />
            <Route path="visualize" element={<Visualize />} />
            <Route path="chat" element={<ZenChat />} />
          </Route>
        </Routes>
      </Router>
    </SessionProvider>
  );
}

export default App;
