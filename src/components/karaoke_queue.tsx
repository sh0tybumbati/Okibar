import React from 'react';
import { useCantinaActions } from '../hooks/useCantinaActions';
import LandingScreen from './LandingScreen';
import TableMode from './TableMode';
import TVMode from './TVMode';
import BarConsole from './BarConsole';

const KaraokeBarApp = () => {
  const actions = useCantinaActions();
  const { mode, overlays } = actions;

  if (!mode) return <LandingScreen {...actions} />;
  if (mode === 'table') return <TableMode {...actions} />;
  if (mode === 'tv') return <TVMode {...actions} />;
  if (mode === 'bar') return <BarConsole {...actions} />;
  return null;
};

export default KaraokeBarApp;
