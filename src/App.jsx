import { useState } from 'react';
import AuthScreen from './AuthScreen';
import Editor from './Editor';
import './index.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <div className="app-root">
      {isAuthenticated ? (
        <Editor />
      ) : (
        <AuthScreen onLogin={() => setIsAuthenticated(true)} />
      )}
    </div>
  );
}

export default App;
