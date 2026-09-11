import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('rc_theme') || 'light');
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [systemConnected, setSystemConnected] = useState(true);
  const [comparisonPapers, setComparisonPapers] = useState([]);
  const [activeReaderPaper, setActiveReaderPaper] = useState(null);

  // Apply theme to document.body
  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
    }
    localStorage.setItem('rc_theme', theme);
  }, [theme]);

  // Toggle theme
  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Check system health
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/v1/health');
        if (res.ok) {
          setSystemConnected(true);
        } else {
          setSystemConnected(false);
        }
      } catch (err) {
        setSystemConnected(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsCmdPaletteOpen(false);
        setSelectedPaper(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addComparisonPaper = (paper) => {
    if (comparisonPapers.length >= 5) {
      alert("Maximum 5 papers can be compared simultaneously.");
      return;
    }
    const pId = paper.id || paper.canonical_id;
    if (!comparisonPapers.some(p => (p.id || p.canonical_id) === pId)) {
      setComparisonPapers(prev => [...prev, paper]);
    }
  };

  const removeComparisonPaper = (paperId) => {
    setComparisonPapers(prev => prev.filter(p => (p.id || p.canonical_id) !== paperId));
  };

  const clearComparisonPapers = () => {
    setComparisonPapers([]);
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        isCmdPaletteOpen,
        openCmdPalette: () => setIsCmdPaletteOpen(true),
        closeCmdPalette: () => setIsCmdPaletteOpen(false),
        selectedPaper,
        openPaperModal: (paper) => setSelectedPaper(paper),
        closePaperModal: () => setSelectedPaper(null),
        systemConnected,
        comparisonPapers,
        addComparisonPaper,
        removeComparisonPaper,
        clearComparisonPapers,
        activeReaderPaper,
        setActiveReaderPaper,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
